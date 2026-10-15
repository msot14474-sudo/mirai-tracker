import {
  calculateExamReadiness,
  calculateSubjectProgress,
  rollUpProgress,
  SubjectProgressCalculation,
} from '@mirai/calculations';
import {
  AuditAction,
  LessonPlanStatus,
  Prisma,
  ProgressStatus,
  SubjectOfferingStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
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

const progressInclude = Prisma.validator<Prisma.SubjectOfferingInclude>()({
  subject: { select: { id: true, code: true, name: true } },
  batch: {
    include: {
      track: { select: { id: true, code: true, name: true } },
      semester: {
        include: {
          campus: true,
          examWindows: { orderBy: { startDate: 'asc' } },
        },
      },
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
        include: {
          topics: {
            orderBy: { sequence: 'asc' },
            include: {
              examScopes: { select: { examWindowId: true } },
            },
          },
        },
      },
    },
  },
  sessions: {
    select: {
      id: true,
      sessionDate: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  },
  scheduleVersions: {
    orderBy: { version: 'desc' },
    take: 1,
    include: {
      entries: {
        select: {
          topicId: true,
          plannedStartDate: true,
          plannedFinishDate: true,
        },
      },
    },
  },
  progressSnapshots: {
    orderBy: { calculationVersion: 'desc' },
    take: 1,
  },
});

type ProgressOffering = Prisma.SubjectOfferingGetPayload<{
  include: typeof progressInclude;
}>;

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async list(asOfDate: string, user: AuthenticatedUser, campusId?: string) {
    const offerings = await this.findOfferings(user, campusId);

    return {
      asOfDate,
      subjects: offerings.map((offering) =>
        calculateOffering(offering, asOfDate),
      ),
    };
  }

  async dashboard(
    asOfDate: string,
    user: AuthenticatedUser,
    campusId?: string,
  ) {
    const { subjects } = await this.list(asOfDate, user, campusId);
    if (subjects.length === 0) {
      return {
        asOfDate,
        summary: null,
        campuses: [],
        tracks: [],
        subjects,
      };
    }

    return {
      asOfDate,
      summary: rollUpProgress(subjects),
      campuses: progressGroups(subjects, (subject) => subject.campus),
      tracks: progressGroups(subjects, (subject) => subject.track),
      subjects,
    };
  }

  async examReadiness(
    asOfDate: string,
    user: AuthenticatedUser,
    campusId?: string,
  ) {
    const offerings = await this.findOfferings(user, campusId);
    return calculateExamReadinessView(offerings, asOfDate);
  }

  async subject(offeringId: string, asOfDate: string, user: AuthenticatedUser) {
    await this.access.assertCanViewOffering(user, offeringId);
    return calculateOffering(await this.requireOffering(offeringId), asOfDate);
  }

  async snapshot(
    offeringId: string,
    asOfDate: string,
    user: AuthenticatedUser,
  ) {
    await this.access.assertCanManageOffering(user, offeringId);
    const offering = await this.requireOffering(offeringId);
    const result = calculateOffering(offering, asOfDate);
    const nextVersion =
      (offering.progressSnapshots[0]?.calculationVersion ?? 0) + 1;
    const saved = await this.prisma.$transaction(async (transaction) => {
      const snapshot = await transaction.progressSnapshot.create({
        data: {
          offeringId,
          asOfDate: parseIsoDate(asOfDate),
          calculationVersion: nextVersion,
          hoursInScopeMinutes: result.minutes.hoursInScope,
          coveredMinutes: result.minutes.covered,
          remainingMinutes: result.minutes.remaining,
          availableMinutes: result.minutes.available,
          coveragePercentage: result.coveragePercentage,
          bufferRatio: result.bufferRatio,
          paceMinutes: result.minutes.paceVsPlan,
          status: result.status as ProgressStatus,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          campusId: offering.batch.semester.campus.id,
          action: AuditAction.CREATE,
          entityType: 'ProgressSnapshot',
          entityId: snapshot.id,
          after: {
            asOfDate,
            calculationVersion: nextVersion,
            hoursInScope: result.hoursInScope,
            coveredHours: result.coveredHours,
            coveragePercentage: result.coveragePercentage,
            remainingHours: result.remainingHours,
            availableHours: result.availableHours,
            bufferRatio: result.bufferRatio,
            paceVsPlanHours: result.paceVsPlanHours,
            status: result.status,
          },
          metadata: {
            offeringId,
            lessonPlanId: result.lessonPlan.id,
            scheduleVersion: result.scheduleVersion,
          },
        },
      });
      return snapshot;
    });

    return {
      snapshot: {
        id: saved.id,
        version: saved.calculationVersion,
        calculatedAt: saved.calculatedAt,
      },
      subject: result,
    };
  }

  private offeringScope(
    user: AuthenticatedUser,
  ): Prisma.SubjectOfferingWhereInput {
    if (this.access.isGlobalManager(user)) return {};
    const scopes: Prisma.SubjectOfferingWhereInput[] = [];
    const campusIds = user.roles
      .filter(
        (assignment) =>
          assignment.role === UserRole.CAMPUS_MANAGER && assignment.campusId,
      )
      .map((assignment) => assignment.campusId!);
    if (campusIds.length) {
      scopes.push({ batch: { semester: { campusId: { in: campusIds } } } });
    }
    if (
      user.staffProfileId &&
      user.roles.some((assignment) => assignment.role === UserRole.FACULTY)
    ) {
      scopes.push({
        faculty: {
          some: { staffProfileId: user.staffProfileId, active: true },
        },
      });
    }
    if (
      user.studentProfile?.batchId &&
      user.roles.some((assignment) => assignment.role === UserRole.STUDENT)
    ) {
      scopes.push({ batchId: user.studentProfile.batchId });
    }
    return scopes.length ? { OR: scopes } : { id: { in: [] } };
  }

  private findOfferings(user: AuthenticatedUser, campusId?: string) {
    return this.prisma.subjectOffering.findMany({
      where: {
        AND: [
          this.offeringScope(user),
          ...(campusId ? [{ batch: { semester: { campusId } } }] : []),
          {
            status: {
              in: [
                SubjectOfferingStatus.ACTIVE,
                SubjectOfferingStatus.COMPLETE,
              ],
            },
          },
        ],
      },
      include: progressInclude,
      orderBy: [
        { batch: { semester: { campus: { name: 'asc' } } } },
        { batch: { track: { name: 'asc' } } },
        { batch: { code: 'asc' } },
        { subject: { code: 'asc' } },
      ],
    });
  }

  private async requireOffering(offeringId: string) {
    const offering = await this.prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: progressInclude,
    });
    if (!offering) throw new NotFoundException('Subject offering not found.');
    return offering;
  }
}

function calculateOffering(offering: ProgressOffering, asOfDate: string) {
  const lessonPlan = preferredPlan(offering.lessonPlans);
  if (!lessonPlan) {
    throw new BadRequestException(
      `${offering.subject.code} needs a lesson plan before progress can be calculated.`,
    );
  }
  const latestSchedule = offering.scheduleVersions[0] ?? null;
  const plannedDates = new Map(
    (latestSchedule?.entries ?? []).map((entry) => [entry.topicId, entry]),
  );
  const topics = lessonPlan.units.flatMap((unit) =>
    unit.topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      plannedMinutes: topic.plannedMinutes,
      status: topic.status,
      completionPercentage: Number(topic.currentCompletionPercentage),
      plannedFinishDate: plannedDates.has(topic.id)
        ? formatIsoDate(plannedDates.get(topic.id)!.plannedFinishDate)
        : null,
    })),
  );
  const calculation: SubjectProgressCalculation = calculateSubjectProgress({
    asOfDate,
    targetFinishDate: formatIsoDate(offering.targetFinishDate),
    thresholds: {
      onTrack: Number(
        offering.onTrackThreshold ??
          offering.batch.semester.defaultOnTrackThreshold,
      ),
      tight: Number(
        offering.tightThreshold ??
          offering.batch.semester.defaultTightThreshold,
      ),
    },
    topics,
    sessions: offering.sessions.map((session) => ({
      sessionDate: formatIsoDate(session.sessionDate),
      plannedMinutes: Math.round(
        (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
      ),
      status: session.status,
    })),
  });
  const overdueIds = new Set(calculation.overdueTopicIds);

  return {
    id: offering.id,
    subject: offering.subject,
    batch: {
      id: offering.batch.id,
      code: offering.batch.code,
      name: offering.batch.name,
    },
    track: offering.batch.track,
    campus: {
      id: offering.batch.semester.campus.id,
      code: offering.batch.semester.campus.code,
      name: offering.batch.semester.campus.name,
    },
    semester: {
      id: offering.batch.semester.id,
      name: offering.batch.semester.name,
    },
    lessonPlan: {
      id: lessonPlan.id,
      version: lessonPlan.version,
      status: lessonPlan.status,
    },
    scheduleVersion: latestSchedule?.version ?? null,
    ...calculation,
    overdueTopics: topics
      .filter((topic) => overdueIds.has(topic.id))
      .map((topic) => ({
        id: topic.id,
        title: topic.title,
        plannedFinishDate: topic.plannedFinishDate,
        completionPercentage: topic.completionPercentage,
      })),
  };
}

function preferredPlan<T extends { status: LessonPlanStatus; version: number }>(
  plans: T[],
) {
  return (
    plans.find((plan) => plan.status === LessonPlanStatus.ACTIVE) ?? plans[0]
  );
}

type CalculatedOffering = ReturnType<typeof calculateOffering>;
type ProgressGroupIdentity = { id: string; code: string; name: string };

function progressGroups(
  subjects: CalculatedOffering[],
  identityFor: (subject: CalculatedOffering) => ProgressGroupIdentity,
) {
  const groups = new Map<
    string,
    { identity: ProgressGroupIdentity; subjects: CalculatedOffering[] }
  >();
  for (const subject of subjects) {
    const identity = identityFor(subject);
    const group = groups.get(identity.id) ?? { identity, subjects: [] };
    group.subjects.push(subject);
    groups.set(identity.id, group);
  }

  return [...groups.values()]
    .map(({ identity, subjects: groupedSubjects }) => ({
      ...identity,
      ...rollUpProgress(groupedSubjects),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function calculateExamReadinessView(
  offerings: ProgressOffering[],
  asOfDate: string,
) {
  const exams = new Map<
    string,
    {
      exam: ProgressOffering['batch']['semester']['examWindows'][number];
      semester: { id: string; name: string };
      campus: { id: string; code: string; name: string };
      topics: Array<{
        id: string;
        title: string;
        plannedMinutes: number;
        status: ProgressOffering['lessonPlans'][number]['units'][number]['topics'][number]['status'];
        completionPercentage: number;
      }>;
      subjects: Array<Record<string, unknown>>;
    }
  >();

  for (const offering of offerings) {
    const upcomingExams = offering.batch.semester.examWindows.filter(
      (exam) => formatIsoDate(exam.startDate) >= asOfDate,
    );
    for (const exam of upcomingExams) {
      if (!exams.has(exam.id)) {
        exams.set(exam.id, {
          exam,
          semester: {
            id: offering.batch.semester.id,
            name: offering.batch.semester.name,
          },
          campus: {
            id: offering.batch.semester.campus.id,
            code: offering.batch.semester.campus.code,
            name: offering.batch.semester.campus.name,
          },
          topics: [],
          subjects: [],
        });
      }
    }

    const lessonPlan = preferredPlan(offering.lessonPlans);
    if (!lessonPlan) continue;
    const topics = lessonPlan.units.flatMap((unit) =>
      unit.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        plannedMinutes: topic.plannedMinutes,
        status: topic.status,
        completionPercentage: Number(topic.currentCompletionPercentage),
        examWindowIds: topic.examScopes.map((scope) => scope.examWindowId),
      })),
    );

    for (const exam of upcomingExams) {
      const scopedTopics = topics.filter((topic) =>
        topic.examWindowIds.includes(exam.id),
      );
      if (scopedTopics.length === 0) continue;
      const calculation = calculateExamReadiness(scopedTopics);
      const accumulator = exams.get(exam.id)!;
      accumulator.topics.push(...scopedTopics);
      accumulator.subjects.push({
        id: offering.id,
        subject: offering.subject,
        batch: {
          id: offering.batch.id,
          code: offering.batch.code,
          name: offering.batch.name,
        },
        track: offering.batch.track,
        lessonPlan: {
          id: lessonPlan.id,
          version: lessonPlan.version,
          status: lessonPlan.status,
        },
        ...calculation,
        topics: scopedTopics.map(({ examWindowIds: _ids, ...topic }) => topic),
      });
    }
  }

  return {
    asOfDate,
    exams: [...exams.values()]
      .map(({ exam, semester, campus, topics, subjects }) => ({
        id: exam.id,
        name: exam.name,
        type: exam.type,
        startDate: formatIsoDate(exam.startDate),
        endDate: formatIsoDate(exam.endDate),
        syllabusDeadline: formatIsoDate(exam.syllabusDeadline),
        daysUntilExam: daysBetween(asOfDate, formatIsoDate(exam.startDate)),
        deadlinePassed: formatIsoDate(exam.syllabusDeadline) < asOfDate,
        semester,
        campus,
        ...calculateExamReadiness(topics),
        subjects,
      }))
      .sort(
        (left, right) =>
          left.startDate.localeCompare(right.startDate) ||
          left.campus.name.localeCompare(right.campus.name) ||
          left.name.localeCompare(right.name),
      ),
  };
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}
