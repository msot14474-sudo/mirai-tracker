import {
  AlertStatus,
  AlertType,
  AuditAction,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  ScheduledSessionStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { formatIsoDate } from '../academic-calendar/calendar-engine';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { EmailNotificationService } from './email-notification.service';
import { alertDueAt, isAlertDue } from './missed-log-alert.engine';

const alertSessionInclude = Prisma.validator<Prisma.ScheduledSessionInclude>()({
  logs: { select: { id: true }, take: 1 },
  facultyAssignment: {
    include: { staffProfile: { include: { user: true } } },
  },
  offering: {
    include: {
      subject: true,
      batch: { include: { semester: { include: { campus: true } } } },
      faculty: {
        where: { active: true },
        include: { staffProfile: { include: { user: true } } },
      },
    },
  },
});

type AlertSession = Prisma.ScheduledSessionGetPayload<{
  include: typeof alertSessionInclude;
}>;

type Recipient = { id: string; name: string; email: string };

@Injectable()
export class MissedLogAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailNotificationService,
  ) {}

  assertInternalSecret(provided: string | undefined) {
    const expected = process.env.INTERNAL_JOB_SECRET;
    if (!expected || !provided || !sameSecret(expected, provided)) {
      throw new UnauthorizedException('Invalid background-job credentials.');
    }
  }

  async processDue(type: AlertType, now = new Date()) {
    const sessions: AlertSession[] = [];
    let cursor: string | undefined;
    while (true) {
      const page = await this.prisma.scheduledSession.findMany({
        where: {
          status: ScheduledSessionStatus.SCHEDULED,
          endsAt: { lte: now },
          logs: { none: {} },
        },
        include: alertSessionInclude,
        orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      sessions.push(...page);
      if (page.length < 500) break;
      cursor = page[page.length - 1]!.id;
    }
    const due = sessions.filter((session) =>
      isAlertDue(
        type,
        {
          sessionDate: session.sessionDate,
          endsAt: session.endsAt,
          timezone: session.offering.batch.semester.campus.timezone,
        },
        now,
      ),
    );
    const managerCache = new Map<string, Recipient[]>();
    const result = {
      scanned: sessions.length,
      due: due.length,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    for (const session of due) {
      const recipients =
        type === AlertType.FACULTY_MISSED_LOG
          ? facultyRecipients(session)
          : await this.campusManagerRecipients(
              session.offering.batch.semester.campus.id,
              managerCache,
            );
      if (recipients.length === 0) result.skipped += 1;
      for (const recipient of recipients) {
        const outcome = await this.createAndSend(type, session, recipient, now);
        result[outcome] += 1;
      }
    }
    return { type, processedAt: now, ...result };
  }

  async listMine(user: AuthenticatedUser, campusId?: string) {
    const alerts = await this.prisma.missedLogAlert.findMany({
      where: {
        recipientUserId: user.id,
        ...(campusId
          ? {
              scheduledSession: {
                offering: { batch: { semester: { campusId } } },
              },
            }
          : {}),
      },
      include: {
        deliveries: { orderBy: { createdAt: 'asc' } },
        scheduledSession: {
          include: {
            offering: {
              include: {
                subject: true,
                batch: { include: { semester: { include: { campus: true } } } },
              },
            },
          },
        },
      },
      orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const items = alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      status: alert.status,
      dueAt: alert.dueAt,
      sentAt: alert.sentAt,
      subject: {
        code: alert.scheduledSession.offering.subject.code,
        name: alert.scheduledSession.offering.subject.name,
      },
      batch: {
        code: alert.scheduledSession.offering.batch.code,
        name: alert.scheduledSession.offering.batch.name,
      },
      campus: alert.scheduledSession.offering.batch.semester.campus,
      session: {
        id: alert.scheduledSession.id,
        date: formatIsoDate(alert.scheduledSession.sessionDate),
        startsAt: alert.scheduledSession.startsAt,
        endsAt: alert.scheduledSession.endsAt,
      },
      deliveries: alert.deliveries.map((delivery) => ({
        channel: delivery.channel,
        status: delivery.status,
        sentAt: delivery.sentAt,
        deliveredAt: delivery.deliveredAt,
      })),
    }));
    return {
      summary: {
        total: items.length,
        facultyReminders: items.filter(
          (item) => item.type === AlertType.FACULTY_MISSED_LOG,
        ).length,
        managerEscalations: items.filter(
          (item) => item.type === AlertType.CAMPUS_MANAGER_ESCALATION,
        ).length,
        failed: items.filter((item) => item.status === AlertStatus.FAILED)
          .length,
      },
      alerts: items,
    };
  }

  private async campusManagerRecipients(
    campusId: string,
    cache: Map<string, Recipient[]>,
  ) {
    const cached = cache.get(campusId);
    if (cached) return cached;
    const assignments = await this.prisma.roleAssignment.findMany({
      where: {
        campusId,
        role: UserRole.CAMPUS_MANAGER,
        user: { status: UserStatus.ACTIVE },
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            notificationEmail: true,
          },
        },
      },
    });
    const recipients = assignments.map((assignment) =>
      recipientForUser(assignment.user),
    );
    cache.set(campusId, recipients);
    return recipients;
  }

  private async createAndSend(
    type: AlertType,
    session: AlertSession,
    recipient: Recipient,
    now: Date,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    const timezone = session.offering.batch.semester.campus.timezone;
    const dueAt = alertDueAt(type, {
      sessionDate: session.sessionDate,
      endsAt: session.endsAt,
      timezone,
    });
    const alert = await this.prisma.missedLogAlert.upsert({
      where: {
        deduplicationKey: `${type}:${session.id}:${recipient.id}`,
      },
      create: {
        scheduledSessionId: session.id,
        type,
        recipientUserId: recipient.id,
        dueAt,
        deduplicationKey: `${type}:${session.id}:${recipient.id}`,
      },
      update: {},
      include: { deliveries: true },
    });
    if (
      alert.status === AlertStatus.SENT ||
      alert.status === AlertStatus.CANCELLED ||
      alert.deliveries.some(
        (delivery) =>
          delivery.channel === NotificationChannel.EMAIL &&
          (delivery.status === NotificationStatus.SENT ||
            delivery.status === NotificationStatus.DELIVERED),
      )
    ) {
      return 'skipped';
    }

    const emailAttempts = alert.deliveries.filter(
      (delivery) => delivery.channel === NotificationChannel.EMAIL,
    );
    const latestAttempt = emailAttempts.sort(
      (a, b) => b.attemptNumber - a.attemptNumber,
    )[0];
    if (
      latestAttempt &&
      (latestAttempt.status === NotificationStatus.QUEUED ||
        latestAttempt.attemptNumber >= 3 ||
        now.getTime() - latestAttempt.scheduledAt.getTime() < 5 * 60 * 1000)
    )
      return 'skipped';
    const attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;
    const stillMissing = await this.prisma.scheduledSession.findFirst({
      where: {
        id: session.id,
        status: ScheduledSessionStatus.SCHEDULED,
        logs: { none: {} },
      },
      select: { id: true },
    });
    if (!stillMissing) return 'skipped';

    await this.prisma.notificationDelivery.upsert({
      where: {
        alertId_recipientUserId_channel_attemptNumber: {
          alertId: alert.id,
          recipientUserId: recipient.id,
          channel: NotificationChannel.IN_APP,
          attemptNumber: 1,
        },
      },
      create: {
        alertId: alert.id,
        recipientUserId: recipient.id,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.DELIVERED,
        scheduledAt: dueAt,
        sentAt: now,
        deliveredAt: now,
      },
      update: {},
    });
    // A unique attempt row claims this send across simultaneous scheduler runs.
    let emailDelivery;
    try {
      emailDelivery = await this.prisma.notificationDelivery.create({
        data: {
          alertId: alert.id,
          recipientUserId: recipient.id,
          channel: NotificationChannel.EMAIL,
          attemptNumber,
          scheduledAt: now,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return 'skipped';
      throw error;
    }

    try {
      const message = await this.email.sendMissedLog({
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        kind:
          type === AlertType.FACULTY_MISSED_LOG
            ? 'faculty-reminder'
            : 'manager-escalation',
        subjectCode: session.offering.subject.code,
        subjectName: session.offering.subject.name,
        batchName: session.offering.batch.name,
        sessionDate: formatIsoDate(session.sessionDate),
        startsAt: session.startsAt,
        campusTimezone: timezone,
      });
      await this.prisma.$transaction([
        this.prisma.notificationDelivery.update({
          where: { id: emailDelivery.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: now,
            providerMessageId: message.messageId,
          },
        }),
        this.prisma.missedLogAlert.update({
          where: { id: alert.id },
          data: { status: AlertStatus.SENT, sentAt: now, lastError: null },
        }),
        this.prisma.auditEvent.create({
          data: {
            campusId: session.offering.batch.semester.campus.id,
            action: AuditAction.CREATE,
            entityType: 'MissedLogAlert',
            entityId: alert.id,
            after: {
              type,
              status: AlertStatus.SENT,
              recipientUserId: recipient.id,
            },
            metadata: {
              scheduledSessionId: session.id,
              dueAt: dueAt.toISOString(),
            },
          },
        }),
      ]);
      return 'sent';
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SMTP delivery failed.';
      await this.prisma.$transaction([
        this.prisma.notificationDelivery.update({
          where: { id: emailDelivery.id },
          data: { status: NotificationStatus.FAILED, errorMessage: message },
        }),
        this.prisma.missedLogAlert.update({
          where: { id: alert.id },
          data: { status: AlertStatus.FAILED, lastError: message },
        }),
      ]);
      return 'failed';
    }
  }
}

function facultyRecipients(session: AlertSession): Recipient[] {
  const direct = session.facultyAssignment?.staffProfile.user;
  if (direct?.status === UserStatus.ACTIVE) return [recipientForUser(direct)];
  const date = session.sessionDate.getTime();
  const assignment = session.offering.faculty.find(
    (candidate) =>
      candidate.startDate.getTime() <= date &&
      (!candidate.endDate || candidate.endDate.getTime() >= date) &&
      candidate.staffProfile.user.status === UserStatus.ACTIVE,
  );
  return assignment ? [recipientForUser(assignment.staffProfile.user)] : [];
}

function recipientForUser(user: {
  id: string;
  name: string;
  email: string;
  notificationEmail?: string | null;
}): Recipient {
  return {
    id: user.id,
    name: user.name,
    email: user.notificationEmail ?? user.email,
  };
}

function sameSecret(expected: string, provided: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}
