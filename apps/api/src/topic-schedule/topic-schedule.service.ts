import {
  buildTimetableSessions,
  isoWeekday,
} from '../timetable/timetable-engine';
import {
  AuditAction,
  LessonPlanStatus,
  Prisma,
  ScheduleCalculationReason,
  ScheduledSessionStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatIsoDate,
  parseIsoDate,
} from '../academic-calendar/calendar-engine';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  calculateTopicSchedule,
  calculateRemainingSchedule,
  TeachingSession,
  TopicDemand,
  TopicScheduleCalculation,
} from './topic-schedule.engine';
import {
  CalculateTopicScheduleInput,
  SetSessionCancellationInput,
} from './topic-schedule.schemas';

@Injectable()
export class TopicScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async listOfferings(user: AuthenticatedUser, campusId?: string) {
    const offerings = await this.prisma.subjectOffering.findMany({
      where: campusId
        ? {
            AND: [
              this.offeringScope(user),
              { batch: { semester: { campusId } } },
            ],
          }
        : this.offeringScope(user),
      include: {
        subject: { select: { id: true, code: true, name: true } },
        batch: {
          select: {
            id: true,
            code: true,
            name: true,
            semester: {
              select: {
                id: true,
                name: true,
                campus: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        lessonPlans: {
          where: {
            status: { in: [LessonPlanStatus.ACTIVE, LessonPlanStatus.DRAFT] },
          },
          orderBy: { version: 'desc' },
          include: { units: { include: { topics: true } } },
        },
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { _count: { select: { entries: true } } },
        },
        _count: { select: { sessions: true } },
      },
      orderBy: [
        { batch: { semester: { campus: { name: 'asc' } } } },
        { batch: { code: 'asc' } },
        { subject: { code: 'asc' } },
      ],
    });

    return offerings.map((offering) => {
      const plan = preferredPlan(offering.lessonPlans);
      const topics = plan?.units.flatMap((unit) => unit.topics) ?? [];
      const latest = offering.scheduleVersions[0] ?? null;
      return {
        id: offering.id,
        subject: offering.subject,
        batch: offering.batch,
        plan: plan
          ? {
              id: plan.id,
              version: plan.version,
              status: plan.status,
              topics: topics.length,
              totalPlannedMinutes: topics.reduce(
                (total, topic) => total + topic.plannedMinutes,
                0,
              ),
            }
          : null,
        sessions: offering._count.sessions,
        latestSchedule: latest
          ? {
              version: latest.version,
              reason: latest.reason,
              calculatedAt: latest.calculatedAt,
              scheduledTopics: latest._count.entries,
            }
          : null,
      };
    });
  }

  async offering(offeringId: string, user: AuthenticatedUser) {
    await this.access.assertCanManageOffering(user, offeringId);
    const offering = await this.requirePlanningOffering(offeringId);
    const baseline = await this.prisma.topicScheduleVersion.findFirst({
      where: { offeringId },
      orderBy: { version: 'asc' },
      include: { entries: true },
    });
    return {
      ...serializeDetail(offering),
      baseline: baseline ? serializeVersion(baseline) : null,
    };
  }

  async calculate(
    offeringId: string,
    input: CalculateTopicScheduleInput,
    user: AuthenticatedUser,
  ) {
    await this.access.assertCanManageOffering(user, offeringId);
    const offering = await this.requirePlanningOffering(offeringId);
    const latestVersion = offering.scheduleVersions[0]?.version ?? 0;
    const reason =
      input.reason ??
      (latestVersion === 0
        ? ScheduleCalculationReason.INITIAL
        : ScheduleCalculationReason.MANUAL_RECALCULATION);
    const calculation = calculateForOffering(offering);

    const version = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.topicScheduleVersion.create({
        data: {
          offeringId,
          version: latestVersion + 1,
          reason,
          entries: {
            create: calculation.allocations.map((entry) => ({
              topicId: entry.id,
              plannedStartDate: parseIsoDate(entry.plannedStartDate),
              plannedFinishDate: parseIsoDate(entry.plannedFinishDate),
              allocatedMinutes: entry.allocatedMinutes,
            })),
          },
        },
        include: { entries: true },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: offering.batch.semester.campus.id,
          action: AuditAction.CREATE,
          entityType: 'TopicScheduleVersion',
          entityId: created.id,
          after: {
            version: created.version,
            reason,
            ...calculation.summary,
          },
          metadata: { offeringId, lessonPlanId: selectedPlan(offering)?.id },
        },
      });
      return created;
    });

    return {
      version: serializeVersion(version),
      preview: decorateCalculation(calculation, offering.targetFinishDate),
    };
  }

  async setSessionCancellation(
    sessionId: string,
    input: SetSessionCancellationInput,
    user: AuthenticatedUser,
  ) {
    const session = await this.prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      include: {
        offering: {
          include: {
            batch: { include: { semester: { include: { campus: true } } } },
          },
        },
        _count: { select: { logs: true } },
      },
    });
    if (!session) throw new NotFoundException('Scheduled class not found.');
    await this.access.assertCanManageOffering(user, session.offeringId);
    if (session._count.logs > 0) {
      throw new ConflictException(
        'A logged class cannot be cancelled or restored.',
      );
    }
    if (
      session.status !== ScheduledSessionStatus.SCHEDULED &&
      session.status !== ScheduledSessionStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Only an unlogged scheduled or cancelled class can be changed.',
      );
    }

    if (
      !input.cancelled &&
      (await this.prisma.scheduledSession.findUnique({
        where: { sourceKey: `move:${session.id}` },
      }))
    )
      throw new ConflictException(
        'This class was moved. Manage its replacement instead.',
      );
    const nextStatus = input.cancelled
      ? ScheduledSessionStatus.CANCELLED
      : ScheduledSessionStatus.SCHEDULED;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.scheduledSession.update({
        where: { id: sessionId },
        data: {
          status: nextStatus,
          cancellationReason: input.cancelled ? input.reason : null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: session.offering.batch.semester.campus.id,
          action: AuditAction.UPDATE,
          entityType: 'ScheduledSession',
          entityId: session.id,
          before: {
            status: session.status,
            cancellationReason: session.cancellationReason,
          },
          after: {
            status: nextStatus,
            cancellationReason: input.cancelled ? input.reason : null,
          },
          metadata: { offeringId: session.offeringId },
        },
      });
    });

    return this.calculate(
      session.offeringId,
      {
        reason: input.cancelled
          ? ScheduleCalculationReason.SESSION_CANCELLED
          : ScheduleCalculationReason.MANUAL_RECALCULATION,
      },
      user,
    );
  }

  async moveSession(
    sessionId: string,
    input: { date: string; startTime: string; endTime: string; reason: string },
    user: AuthenticatedUser,
  ) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const session = await tx.scheduledSession.findUnique({
          where: { id: sessionId },
          include: {
            _count: { select: { logs: true } },
            offering: {
              include: {
                faculty: { where: { active: true } },
                batch: {
                  include: {
                    semester: { include: { campus: true, calendarDays: true } },
                  },
                },
              },
            },
          },
        });
        if (!session) throw new NotFoundException('Class not found.');
        await this.access.assertCanManageOffering(user, session.offeringId);
        if (session.status !== 'SCHEDULED' || session._count.logs > 0)
          throw new ConflictException(
            'Only an unlogged scheduled class can be moved.',
          );
        const semester = session.offering.batch.semester;
        const date = parseIsoDate(input.date);
        if (date < semester.startDate || date > semester.endDate)
          throw new BadRequestException('Choose a date inside this semester.');
        const faculty = session.offering.faculty.filter(
          (f) => f.startDate <= date && (!f.endDate || f.endDate >= date),
        );
        if (
          user.roles.some((r) => r.role === 'FACULTY') &&
          !this.access.canManageCampus(user, semester.campusId) &&
          !faculty.some((f) => f.staffProfileId === user.staffProfileId)
        )
          throw new BadRequestException(
            'Your assignment does not cover the selected date.',
          );
        let planned;
        try {
          planned = buildTimetableSessions({
            offeringId: session.offeringId,
            timezone: semester.campus.timezone,
            semesterStart: input.date,
            semesterEnd: input.date,
            saturdayRule: semester.workingSaturdayRule,
            overrides: semester.calendarDays.map((d) => ({
              ...d,
              date: formatIsoDate(d.date),
            })),
            entries: [
              {
                id: session.id,
                weekday: isoWeekday(input.date),
                startTime: input.startTime,
                endTime: input.endTime,
                effectiveFrom: input.date,
                effectiveTo: input.date,
                facultyAssignmentId: session.facultyAssignmentId,
              },
            ],
          })[0];
        } catch {
          throw new BadRequestException(
            'Choose valid start and end times, up to eight hours apart.',
          );
        }
        if (!planned)
          throw new BadRequestException(
            'This is not a teaching day under the campus calendar and Saturday rule.',
          );
        if (planned.startsAt <= new Date())
          throw new BadRequestException('Choose a future class time.');
        const conflict = await tx.scheduledSession.findFirst({
          where: {
            id: { not: sessionId },
            status: { notIn: ['CANCELLED', 'SKIPPED', 'MERGED'] },
            startsAt: { lt: planned.endsAt },
            endsAt: { gt: planned.startsAt },
            OR: [
              { offering: { batchId: session.offering.batchId } },
              {
                offering: {
                  faculty: {
                    some: {
                      active: true,
                      staffProfileId: {
                        in: faculty.map((f) => f.staffProfileId),
                      },
                      startDate: { lte: date },
                      OR: [{ endDate: null }, { endDate: { gte: date } }],
                    },
                  },
                },
              },
            ],
          },
        });
        if (conflict)
          throw new ConflictException(
            'This time overlaps another class for the batch or teacher.',
          );
        await tx.scheduledSession.update({
          where: { id: sessionId },
          data: {
            status: 'CANCELLED',
            cancellationReason: `Moved to ${input.date}: ${input.reason}`,
          },
        });
        const moved = await tx.scheduledSession.create({
          data: {
            sourceKey: `move:${sessionId}`,
            offeringId: session.offeringId,
            facultyAssignmentId: session.facultyAssignmentId,
            sessionDate: date,
            startsAt: planned.startsAt,
            endsAt: planned.endsAt,
            isExtraSession: true,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            campusId: semester.campusId,
            action: AuditAction.UPDATE,
            entityType: 'ScheduledSession',
            entityId: sessionId,
            before: {
              startsAt: session.startsAt.toISOString(),
              endsAt: session.endsAt.toISOString(),
            },
            after: {
              replacementId: moved.id,
              date: input.date,
              reason: input.reason,
            },
          },
        });
        return { offeringId: session.offeringId, sessionId: moved.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return result;
  }

  private offeringScope(
    user: AuthenticatedUser,
  ): Prisma.SubjectOfferingWhereInput {
    if (this.access.isGlobalManager(user)) return {};
    const campusIds = user.roles
      .filter((role) => role.role === UserRole.CAMPUS_MANAGER && role.campusId)
      .map((role) => role.campusId!);
    const scopes: Prisma.SubjectOfferingWhereInput[] = [];
    if (campusIds.length) {
      scopes.push({ batch: { semester: { campusId: { in: campusIds } } } });
    }
    if (
      user.staffProfileId &&
      user.roles.some((role) => role.role === UserRole.FACULTY)
    ) {
      scopes.push({
        faculty: {
          some: { staffProfileId: user.staffProfileId, active: true },
        },
      });
    }
    return scopes.length ? { OR: scopes } : { id: { in: [] } };
  }

  private async requirePlanningOffering(offeringId: string) {
    const offering = await this.prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        batch: {
          include: {
            semester: { include: { campus: true } },
          },
        },
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
        sessions: {
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          include: { _count: { select: { logs: true } } },
        },
        scheduleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            entries: {
              orderBy: { plannedStartDate: 'asc' },
              include: {
                topic: { include: { unit: true } },
              },
            },
          },
        },
      },
    });
    if (!offering) throw new NotFoundException('Subject offering not found.');
    return offering;
  }
}

type PlanningOffering = Awaited<
  ReturnType<TopicScheduleService['requirePlanningOffering']>
>;

function selectedPlan(offering: PlanningOffering) {
  return preferredPlan(offering.lessonPlans);
}

function preferredPlan<T extends { status: LessonPlanStatus; version: number }>(
  plans: T[],
) {
  return (
    plans.find((plan) => plan.status === LessonPlanStatus.ACTIVE) ?? plans[0]
  );
}

function calculateForOffering(offering: PlanningOffering) {
  const plan = selectedPlan(offering);
  if (!plan) {
    throw new BadRequestException(
      'Import a draft or active lesson plan before calculating topic dates.',
    );
  }
  const topics: TopicDemand[] = plan.units.flatMap((unit) =>
    unit.topics.map((topic) => ({
      id: topic.id,
      unitSequence: unit.sequence,
      topicSequence: topic.sequence,
      unitTitle: unit.title,
      title: topic.title,
      requiredMinutes: topic.plannedMinutes,
    })),
  );
  const sessions: TeachingSession[] = offering.sessions.map((session) => ({
    id: session.id,
    sessionDate: session.sessionDate,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    status: session.status,
  }));
  return calculateTopicSchedule(topics, sessions);
}

function serializeDetail(offering: PlanningOffering) {
  const plan = selectedPlan(offering);
  const calculation = plan
    ? calculateForOffering(offering)
    : emptyCalculation(offering.sessions.length);
  return {
    id: offering.id,
    subject: offering.subject,
    batch: {
      id: offering.batch.id,
      code: offering.batch.code,
      name: offering.batch.name,
    },
    semester: {
      id: offering.batch.semester.id,
      name: offering.batch.semester.name,
      startDate: formatIsoDate(offering.batch.semester.startDate),
      endDate: formatIsoDate(offering.batch.semester.endDate),
      campus: offering.batch.semester.campus,
    },
    targetFinishDate: formatIsoDate(offering.targetFinishDate),
    plan: plan
      ? {
          id: plan.id,
          version: plan.version,
          status: plan.status,
          topics: plan.units.reduce(
            (total, unit) => total + unit.topics.length,
            0,
          ),
          totalPlannedMinutes: plan.units.reduce(
            (total, unit) =>
              total +
              unit.topics.reduce(
                (subtotal, topic) => subtotal + topic.plannedMinutes,
                0,
              ),
            0,
          ),
        }
      : null,
    sessions: offering.sessions.map((session) => ({
      id: session.id,
      sessionDate: formatIsoDate(session.sessionDate),
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      plannedMinutes: Math.round(
        (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
      ),
      status: session.status,
      cancellationReason: session.cancellationReason,
      hasLogs: session._count.logs > 0,
      isExtraSession: session.isExtraSession,
    })),
    forecast: plan
      ? decorateCalculation(
          calculateRemainingSchedule(
            plan.units.flatMap((unit) =>
              unit.topics.map((topic) => ({
                id: topic.id,
                unitSequence: unit.sequence,
                topicSequence: topic.sequence,
                unitTitle: unit.title,
                title: topic.title,
                requiredMinutes: topic.plannedMinutes,
                completionPercentage: Number(topic.currentCompletionPercentage),
                skipped: topic.status === 'SKIPPED',
              })),
            ),
            offering.sessions.map((session) => ({
              ...session,
              hasLogs: session._count.logs > 0,
            })),
            new Date(),
          ),
          offering.targetFinishDate,
        )
      : emptyCalculation(0),
    coverage: plan
      ? plan.units.flatMap((unit) =>
          unit.topics.map((topic) => ({
            id: topic.id,
            title: topic.title,
            completionPercentage: Number(topic.currentCompletionPercentage),
            status: topic.status,
          })),
        )
      : [],
    preview: decorateCalculation(calculation, offering.targetFinishDate),
    latestVersion: offering.scheduleVersions[0]
      ? serializeVersion(offering.scheduleVersions[0])
      : null,
  };
}

function decorateCalculation(
  calculation: TopicScheduleCalculation,
  targetFinishDate: Date,
) {
  const target = formatIsoDate(targetFinishDate);
  return {
    ...calculation,
    allocations: calculation.allocations.map((entry) => ({
      ...entry,
      afterTarget: entry.plannedFinishDate > target,
    })),
  };
}

function emptyCalculation(excludedSessions: number): TopicScheduleCalculation {
  return {
    allocations: [],
    unscheduledTopics: [],
    summary: {
      requiredMinutes: 0,
      availableMinutes: 0,
      allocatedMinutes: 0,
      shortfallMinutes: 0,
      usableSessions: 0,
      excludedSessions,
    },
  };
}

function serializeVersion(version: {
  id: string;
  version: number;
  reason: ScheduleCalculationReason;
  calculatedAt: Date;
  entries: Array<{
    id: string;
    topicId: string;
    plannedStartDate: Date;
    plannedFinishDate: Date;
    allocatedMinutes: number;
  }>;
}) {
  return {
    id: version.id,
    version: version.version,
    reason: version.reason,
    calculatedAt: version.calculatedAt,
    entries: version.entries.map((entry) => ({
      id: entry.id,
      topicId: entry.topicId,
      plannedStartDate: formatIsoDate(entry.plannedStartDate),
      plannedFinishDate: formatIsoDate(entry.plannedFinishDate),
      allocatedMinutes: entry.allocatedMinutes,
    })),
  };
}
