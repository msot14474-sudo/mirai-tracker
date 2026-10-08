import {
  AlertStatus,
  AuditAction,
  LessonPlanStatus,
  NotificationStatus,
  Prisma,
  ScheduleCalculationReason,
  ScheduledSessionStatus,
  SessionLogStatus,
  TopicStatus,
  UserRole,
  WorkStatus,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatIsoDate,
  parseIsoDate,
} from '../academic-calendar/calendar-engine';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { TopicScheduleService } from '../topic-schedule/topic-schedule.service';
import { CreateSessionLogInput } from './session-log.schemas';

const sessionInclude = Prisma.validator<Prisma.ScheduledSessionInclude>()({
  offering: {
    include: {
      subject: { select: { id: true, code: true, name: true } },
      batch: {
        include: {
          semester: { include: { campus: true } },
        },
      },
      faculty: true,
      lessonPlans: {
        where: {
          status: { in: [LessonPlanStatus.ACTIVE, LessonPlanStatus.DRAFT] },
        },
        orderBy: { version: 'desc' },
        include: {
          units: {
            orderBy: { sequence: 'asc' },
            include: { topics: { orderBy: { sequence: 'asc' } } },
          },
        },
      },
      scheduleVersions: {
        orderBy: { version: 'desc' },
        take: 1,
        include: { entries: true },
      },
    },
  },
  logs: {
    orderBy: { revision: 'desc' },
    take: 1,
    include: { topicUpdates: true },
  },
});

type SessionWithContext = Prisma.ScheduledSessionGetPayload<{
  include: typeof sessionInclude;
}>;

@Injectable()
export class SessionLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: TopicScheduleService,
  ) {}

  async listForDate(dateText: string, user: AuthenticatedUser) {
    const staffProfileId = assertFaculty(user);
    const date = parseIsoDate(dateText);
    const assignmentScope: Prisma.FacultyAssignmentWhereInput = {
      staffProfileId,
      active: true,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    };
    const sessions = await this.prisma.scheduledSession.findMany({
      where: {
        sessionDate: date,
        offering: { faculty: { some: assignmentScope } },
      },
      include: sessionInclude,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    const from = addUtcDays(date, -7);
    const to = addUtcDays(date, 7);
    const mergeTargets = await this.prisma.scheduledSession.findMany({
      where: {
        sessionDate: { gte: from, lte: to },
        status: {
          in: [
            ScheduledSessionStatus.SCHEDULED,
            ScheduledSessionStatus.IN_PROGRESS,
            ScheduledSessionStatus.COMPLETED,
          ],
        },
        offering: { faculty: { some: assignmentScope } },
      },
      select: {
        id: true,
        sessionDate: true,
        startsAt: true,
        offering: {
          select: {
            subject: { select: { code: true, name: true } },
            batch: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });

    return {
      date: dateText,
      sessions: sessions.map(serializeSession),
      mergeTargets: mergeTargets.map((session) => ({
        id: session.id,
        sessionDate: formatIsoDate(session.sessionDate),
        startsAt: session.startsAt,
        subject: session.offering.subject,
        batch: session.offering.batch,
      })),
    };
  }

  async create(
    sessionId: string,
    input: CreateSessionLogInput,
    user: AuthenticatedUser,
  ) {
    const staffProfileId = assertFaculty(user);
    const session = await this.prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundException('Scheduled class not found.');
    if (!isAssigned(session, staffProfileId)) {
      throw new ForbiddenException(
        'Faculty can log sessions only for their assigned subjects.',
      );
    }

    const plan = preferredPlan(session.offering.lessonPlans);
    const topics = plan?.units.flatMap((unit) => unit.topics) ?? [];
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    for (const update of input.topicUpdates) {
      const topic = topicById.get(update.topicId);
      if (!topic) {
        throw new BadRequestException(
          'Every progress update must belong to the selected lesson plan.',
        );
      }
      if (
        update.completionAfterPercentage <
        Number(topic.currentCompletionPercentage)
      ) {
        throw new ConflictException(
          `${topic.title} cannot move backwards from its current completion.`,
        );
      }
    }
    if (
      input.carryForwardTopicId &&
      !topicById.has(input.carryForwardTopicId)
    ) {
      throw new BadRequestException(
        'The carry-forward topic must belong to the selected lesson plan.',
      );
    }

    const sessionMinutes = Math.round(
      (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
    );
    const recordedMinutes = input.topicUpdates.reduce(
      (total, update) => total + (update.minutesUsed ?? 0),
      0,
    );
    if (recordedMinutes > sessionMinutes) {
      throw new BadRequestException(
        'Topic minutes cannot exceed the scheduled class duration.',
      );
    }

    if (input.mergedIntoSessionId) {
      if (input.mergedIntoSessionId === session.id) {
        throw new BadRequestException('A class cannot be merged into itself.');
      }
      const target = await this.prisma.scheduledSession.findUnique({
        where: { id: input.mergedIntoSessionId },
        include: { offering: { include: { faculty: true } } },
      });
      if (
        !target ||
        !isAssigned(target, staffProfileId) ||
        !isCapacityStatus(target.status)
      ) {
        throw new BadRequestException(
          'Choose another scheduled class assigned to you as the merge target.',
        );
      }
    }

    const revision = (session.logs[0]?.revision ?? 0) + 1;
    const saved = await this.prisma.$transaction(async (transaction) => {
      const log = await transaction.sessionLog.create({
        data: {
          scheduledSessionId: session.id,
          revision,
          status: input.status,
          overallCompletionPercentage: input.overallCompletionPercentage,
          coveredSummary: input.coveredSummary,
          leftOverSummary: input.leftOverSummary ?? null,
          carryForwardTopicId: input.carryForwardTopicId ?? null,
          classworkStatus: input.classworkStatus,
          homeworkStatus: input.homeworkStatus,
          notes: input.notes ?? null,
          loggedById: user.id,
          topicUpdates: {
            create: input.topicUpdates.map((update) => {
              const topic = topicById.get(update.topicId)!;
              return {
                topicId: update.topicId,
                completionBeforePercentage: Number(
                  topic.currentCompletionPercentage,
                ),
                completionAfterPercentage: update.completionAfterPercentage,
                minutesUsed: update.minutesUsed ?? null,
                notes: update.notes ?? null,
              };
            }),
          },
        },
        include: { topicUpdates: true },
      });
      for (const update of input.topicUpdates) {
        await transaction.topic.update({
          where: { id: update.topicId },
          data: {
            currentCompletionPercentage: update.completionAfterPercentage,
            status: topicStatus(update.completionAfterPercentage),
          },
        });
      }
      await transaction.scheduledSession.update({
        where: { id: session.id },
        data: {
          status: scheduledStatus(input.status),
          cancellationReason:
            input.status === SessionLogStatus.CANCELLED
              ? input.cancellationReason
              : null,
          mergedIntoSessionId:
            input.status === SessionLogStatus.MERGED
              ? input.mergedIntoSessionId
              : null,
        },
      });
      await transaction.notificationDelivery.updateMany({
        where: {
          alert: { scheduledSessionId: session.id },
          status: NotificationStatus.QUEUED,
        },
        data: { status: NotificationStatus.CANCELLED },
      });
      await transaction.missedLogAlert.updateMany({
        where: {
          scheduledSessionId: session.id,
          status: { in: [AlertStatus.PENDING, AlertStatus.FAILED] },
        },
        data: { status: AlertStatus.CANCELLED },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: session.offering.batch.semester.campus.id,
          action: AuditAction.CREATE,
          entityType: 'SessionLog',
          entityId: log.id,
          after: {
            revision,
            status: input.status,
            overallCompletionPercentage: input.overallCompletionPercentage,
            topicUpdates: input.topicUpdates.length,
          },
          metadata: {
            scheduledSessionId: session.id,
            offeringId: session.offeringId,
            clientElapsedSeconds: input.clientElapsedSeconds,
          },
        },
      });
      return log;
    });

    const capacityChanged =
      isCapacityStatus(session.status) !==
      isCapacityStatus(scheduledStatus(input.status));
    const scheduleUpdate =
      plan && capacityChanged
        ? await this.schedules.calculate(
            session.offeringId,
            {
              reason:
                input.status === SessionLogStatus.CANCELLED
                  ? ScheduleCalculationReason.SESSION_CANCELLED
                  : ScheduleCalculationReason.MANUAL_RECALCULATION,
            },
            user,
          )
        : null;
    return {
      ...serializeLog(saved),
      scheduleVersion: scheduleUpdate?.version ?? null,
    };
  }
}

function assertFaculty(user: AuthenticatedUser) {
  if (
    !user.staffProfileId ||
    !user.roles.some((assignment) => assignment.role === UserRole.FACULTY)
  ) {
    throw new ForbiddenException(
      'A faculty profile is required to log classes.',
    );
  }
  return user.staffProfileId;
}

function isAssigned(
  session: Pick<SessionWithContext, 'sessionDate'> & {
    offering: { faculty: SessionWithContext['offering']['faculty'] };
  },
  staffProfileId: string,
) {
  const date = session.sessionDate.getTime();
  return session.offering.faculty.some(
    (assignment) =>
      assignment.staffProfileId === staffProfileId &&
      assignment.active &&
      assignment.startDate.getTime() <= date &&
      (!assignment.endDate || assignment.endDate.getTime() >= date),
  );
}

function preferredPlan<T extends { status: LessonPlanStatus; version: number }>(
  plans: T[],
) {
  return (
    plans.find((plan) => plan.status === LessonPlanStatus.ACTIVE) ?? plans[0]
  );
}

function serializeSession(session: SessionWithContext) {
  const plan = preferredPlan(session.offering.lessonPlans);
  const topics =
    plan?.units.flatMap((unit) =>
      unit.topics.map((topic) => ({
        id: topic.id,
        unitSequence: unit.sequence,
        unitTitle: unit.title,
        sequence: topic.sequence,
        title: topic.title,
        plannedMinutes: topic.plannedMinutes,
        status: topic.status,
        currentCompletionPercentage: Number(topic.currentCompletionPercentage),
      })),
    ) ?? [];
  const scheduleEntries = new Map(
    (session.offering.scheduleVersions[0]?.entries ?? []).map((entry) => [
      entry.topicId,
      entry,
    ]),
  );
  const topicOptions = topics.map((topic) => {
    const schedule = scheduleEntries.get(topic.id);
    return {
      ...topic,
      plannedStartDate: schedule
        ? formatIsoDate(schedule.plannedStartDate)
        : null,
      plannedFinishDate: schedule
        ? formatIsoDate(schedule.plannedFinishDate)
        : null,
    };
  });
  const latestLog = session.logs[0] ?? null;
  const prefill = latestLog
    ? prefillFromLog(session, latestLog)
    : buildQuickPrefill(session, topicOptions);
  return {
    id: session.id,
    sessionDate: formatIsoDate(session.sessionDate),
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    plannedMinutes: Math.round(
      (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
    ),
    status: session.status,
    isExtraSession: session.isExtraSession,
    subject: session.offering.subject,
    batch: {
      id: session.offering.batch.id,
      code: session.offering.batch.code,
      name: session.offering.batch.name,
    },
    campus: session.offering.batch.semester.campus,
    plan: plan
      ? { id: plan.id, version: plan.version, status: plan.status }
      : null,
    topics: topicOptions,
    latestLog: latestLog ? serializeLog(latestLog) : null,
    prefill,
  };
}

function buildQuickPrefill(
  session: SessionWithContext,
  topics: Array<{
    id: string;
    title: string;
    plannedMinutes: number;
    status: TopicStatus;
    currentCompletionPercentage: number;
  }>,
) {
  const topic = topics.find(
    (candidate) =>
      candidate.status !== TopicStatus.COMPLETED &&
      candidate.status !== TopicStatus.SKIPPED,
  );
  const sessionMinutes = Math.round(
    (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
  );
  const remainingMinutes = topic
    ? (topic.plannedMinutes * (100 - topic.currentCompletionPercentage)) / 100
    : 0;
  const minutesUsed = topic
    ? Math.max(0, Math.min(sessionMinutes, Math.ceil(remainingMinutes)))
    : 0;
  const completion = topic
    ? roundPercentage(
        topic.currentCompletionPercentage +
          (minutesUsed / topic.plannedMinutes) * 100,
      )
    : null;
  const continues = Boolean(topic && completion !== null && completion < 100);
  return {
    status: SessionLogStatus.COMPLETED,
    overallCompletionPercentage: 100,
    coveredSummary: topic?.title ?? 'Scheduled class completed',
    leftOverSummary: continues ? `Continue ${topic!.title}` : null,
    carryForwardTopicId: continues ? topic!.id : null,
    classworkStatus: WorkStatus.NOT_ASSIGNED,
    homeworkStatus: WorkStatus.NOT_ASSIGNED,
    notes: null,
    mergedIntoSessionId: null,
    cancellationReason: null,
    topicUpdates:
      topic && completion !== null
        ? [
            {
              topicId: topic.id,
              completionAfterPercentage: completion,
              minutesUsed,
              notes: null,
            },
          ]
        : [],
  };
}

function prefillFromLog(
  session: SessionWithContext,
  log: SessionWithContext['logs'][number],
) {
  return {
    status: log.status,
    overallCompletionPercentage:
      log.overallCompletionPercentage === null
        ? 0
        : Number(log.overallCompletionPercentage),
    coveredSummary: log.coveredSummary,
    leftOverSummary: log.leftOverSummary,
    carryForwardTopicId: log.carryForwardTopicId,
    classworkStatus: log.classworkStatus,
    homeworkStatus: log.homeworkStatus,
    notes: log.notes,
    mergedIntoSessionId: session.mergedIntoSessionId,
    cancellationReason: session.cancellationReason,
    topicUpdates: log.topicUpdates.map((update) => ({
      topicId: update.topicId,
      completionAfterPercentage: Number(update.completionAfterPercentage),
      minutesUsed: update.minutesUsed,
      notes: update.notes,
    })),
  };
}

function serializeLog(log: {
  id: string;
  revision: number;
  status: SessionLogStatus;
  overallCompletionPercentage: Prisma.Decimal | null;
  coveredSummary: string;
  leftOverSummary: string | null;
  carryForwardTopicId: string | null;
  classworkStatus: WorkStatus;
  homeworkStatus: WorkStatus;
  notes: string | null;
  loggedAt: Date;
  topicUpdates: Array<{
    id: string;
    topicId: string;
    completionBeforePercentage: Prisma.Decimal;
    completionAfterPercentage: Prisma.Decimal;
    minutesUsed: number | null;
    notes: string | null;
  }>;
}) {
  return {
    id: log.id,
    revision: log.revision,
    status: log.status,
    overallCompletionPercentage:
      log.overallCompletionPercentage === null
        ? null
        : Number(log.overallCompletionPercentage),
    coveredSummary: log.coveredSummary,
    leftOverSummary: log.leftOverSummary,
    carryForwardTopicId: log.carryForwardTopicId,
    classworkStatus: log.classworkStatus,
    homeworkStatus: log.homeworkStatus,
    notes: log.notes,
    loggedAt: log.loggedAt,
    topicUpdates: log.topicUpdates.map((update) => ({
      id: update.id,
      topicId: update.topicId,
      completionBeforePercentage: Number(update.completionBeforePercentage),
      completionAfterPercentage: Number(update.completionAfterPercentage),
      minutesUsed: update.minutesUsed,
      notes: update.notes,
    })),
  };
}

function scheduledStatus(status: SessionLogStatus): ScheduledSessionStatus {
  return status as ScheduledSessionStatus;
}

function isCapacityStatus(status: ScheduledSessionStatus) {
  return (
    status === ScheduledSessionStatus.SCHEDULED ||
    status === ScheduledSessionStatus.IN_PROGRESS ||
    status === ScheduledSessionStatus.COMPLETED
  );
}

function topicStatus(completion: number) {
  if (completion >= 100) return TopicStatus.COMPLETED;
  if (completion > 0) return TopicStatus.IN_PROGRESS;
  return TopicStatus.NOT_STARTED;
}

function roundPercentage(value: number) {
  return Math.min(100, Math.round(value * 100) / 100);
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
