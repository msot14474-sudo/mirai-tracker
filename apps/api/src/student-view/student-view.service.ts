import { academicTrackIdentity } from '@mirai/calculations';
import { calculateExamReadiness, calculateSubjectProgress } from '@mirai/calculations';
import {
  LessonPlanStatus,
  Prisma,
  SubjectOfferingStatus,
  TopicStatus,
  UserRole,
} from '@prisma/client';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { formatIsoDate } from '../academic-calendar/calendar-engine';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

const studentBatchInclude = Prisma.validator<Prisma.BatchInclude>()({
  semester: {
    include: {
      campus: { select: { id: true, code: true, name: true, timezone: true } },
      examWindows: { orderBy: { startDate: 'asc' } },
    },
  },
  subjectOfferings: {
    where: {
      status: {
        in: [
          SubjectOfferingStatus.DRAFT,
          SubjectOfferingStatus.ACTIVE,
          SubjectOfferingStatus.COMPLETE,
        ],
      },
    },
    orderBy: { subject: { code: 'asc' } },
    include: {
      _count: { select: { sessions: true } },
      subject: { select: { id: true, code: true, name: true } },
      faculty: {
        where: {
          active: true,
          staffProfile: { active: true, user: { status: 'ACTIVE' } },
        },
        select: {
          startDate: true,
          endDate: true,
          staffProfile: {
            select: { id: true, user: { select: { name: true } } },
          },
        },
      },
      timetableEntries: {
        where: { active: true },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        select: {
          id: true,
          weekday: true,
          startTime: true,
          endTime: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      },
      sessions: {
        where: { status: 'SCHEDULED' },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          sessionDate: true,
          startsAt: true,
          endsAt: true,
          isExtraSession: true,
          status: true,
        },
      },
      lessonPlans: {
        where: { status: LessonPlanStatus.ACTIVE },
        orderBy: { version: 'desc' },
        take: 1,
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
    },
  },
});

type StudentBatch = Prisma.BatchGetPayload<{
  include: typeof studentBatchInclude;
}>;

@Injectable()
export class StudentViewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(asOfDate: string, user: AuthenticatedUser) {
    if (
      !user.roles.some((assignment) => assignment.role === UserRole.STUDENT) ||
      !user.studentProfile
    ) {
      throw new ForbiddenException('An active student profile is required.');
    }

    const campusIds = user.roles
      .filter(
        (assignment) =>
          assignment.role === UserRole.STUDENT && assignment.campusId,
      )
      .map((assignment) => assignment.campusId!);
    if (!campusIds.length)
      throw new ForbiddenException(
        'Your coordinator needs to assign your student campus.',
      );
    const batch = await this.prisma.batch.findFirst({
      where: {
        id: user.studentProfile.batchId,
        active: true,
        semester: { campusId: { in: campusIds }, campus: { active: true } },
        students: {
          some: {
            id: user.studentProfile.id,
            userId: user.id,
            enrollmentStatus: 'ACTIVE',
          },
        },
      },
      include: {
        ...studentBatchInclude,
        subjectOfferings: {
          ...studentBatchInclude.subjectOfferings,
          include: {
            ...studentBatchInclude.subjectOfferings.include,
            sessions: {
              ...studentBatchInclude.subjectOfferings.include.sessions,
              where: {
                status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
                sessionDate: { gte: new Date(`${asOfDate}T00:00:00.000Z`) },
                endsAt: { gt: new Date() },
              },
            },
          },
        },
      },
    });
    if (!batch)
      throw new ForbiddenException(
        'Your coordinator needs to verify your active campus and batch enrolment.',
      );

    return serializeStudentOverview(batch, asOfDate);
  }
}

function serializeStudentOverview(batch: StudentBatch, asOfDate: string) {
  const subjects = batch.subjectOfferings.map((offering) => {
    const plan = offering.lessonPlans[0] ?? null;
    const plannedDates = new Map(
      (offering.scheduleVersions[0]?.entries ?? []).map((entry) => [
        entry.topicId,
        entry,
      ]),
    );
    const topics =
      plan?.units.flatMap((unit) =>
        unit.topics.map((topic) => ({
          id: topic.id,
          unit: { sequence: unit.sequence, title: unit.title },
          sequence: topic.sequence,
          title: topic.title,
          plannedMinutes: topic.plannedMinutes,
          status: topic.status,
          completionPercentage: Number(topic.currentCompletionPercentage),
          plannedStartDate: plannedDates.has(topic.id)
            ? formatIsoDate(plannedDates.get(topic.id)!.plannedStartDate)
            : null,
          plannedFinishDate: plannedDates.has(topic.id)
            ? formatIsoDate(plannedDates.get(topic.id)!.plannedFinishDate)
            : null,
          examWindowIds: topic.examScopes.map((scope) => scope.examWindowId),
        })),
      ) ?? [];
    const calculation = calculateExamReadiness(topics);
    const capacity = plan && calculation.topicsInScope ? calculateSubjectProgress({
      asOfDate,
      targetFinishDate: formatIsoDate(offering.targetFinishDate ?? batch.semester.endDate),
      topics,
      thresholds: {
        onTrack: Number(offering.onTrackThreshold ?? batch.semester.defaultOnTrackThreshold ?? 1.15),
        tight: Number(offering.tightThreshold ?? batch.semester.defaultTightThreshold ?? 1),
      },
      sessions: offering.sessions.map(session => ({
        sessionDate: formatIsoDate(session.sessionDate),
        plannedMinutes: Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000),
        status: session.status ?? 'SCHEDULED',
      })),
    }) : null;
    const weeklyClasses = offering.timetableEntries
      .filter(
        (entry) =>
          formatIsoDate(entry.effectiveFrom) <= asOfDate &&
          (!entry.effectiveTo || formatIsoDate(entry.effectiveTo) >= asOfDate),
      )
      .map((entry) => ({
        id: entry.id,
        weekday: entry.weekday,
        startTime: entry.startTime.toISOString().slice(11, 16),
        endTime: entry.endTime.toISOString().slice(11, 16),
        minutes: (entry.endTime.getTime() - entry.startTime.getTime()) / 60_000,
      }));

    return {
      id: offering.id,
      buffer: capacity ? {
        availableHours: capacity.availableHours,
        remainingHours: capacity.remainingHours,
        bufferRatio: capacity.bufferRatio,
        thresholds: capacity.thresholds,
        status: !offering.timetableEntries.length && !(offering._count?.sessions ?? offering.sessions.length) && capacity.remainingHours > 0 ? 'NEEDS_DATA' : capacity.status,
      } : null,
      subject: offering.subject,
      track: academicTrackIdentity(offering.academicTrack),
      teachers: [
        ...new Map(
          offering.faculty
            .filter(
              (assignment) =>
                formatIsoDate(assignment.startDate) <= asOfDate &&
                (!assignment.endDate ||
                  formatIsoDate(assignment.endDate) >= asOfDate),
            )
            .map(({ staffProfile }) => [
              staffProfile.id,
              { id: staffProfile.id, name: staffProfile.user.name },
            ]),
        ).values(),
      ],
      weeklyClasses,
      weeklyHours:
        weeklyClasses.reduce((total, entry) => total + entry.minutes, 0) / 60,
      upcomingClasses: offering.sessions.filter(s => !s.status || s.status === 'SCHEDULED').slice(0, 5).map((session) => ({
        id: session.id,
        date: formatIsoDate(session.sessionDate),
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        isExtraClass: session.isExtraSession,
      })),
      lessonPlan: plan
        ? { id: plan.id, version: plan.version, status: plan.status }
        : null,
      scheduleVersion: offering.scheduleVersions[0]?.version ?? null,
      plannedHours: calculation.plannedHours,
      coveredHours: calculation.coveredHours,
      coveragePercentage: calculation.coveragePercentage,
      totalTopics: calculation.topicsInScope,
      completedTopics: calculation.completedTopics,
      syllabusTopics: topics
        .filter((topic) => topic.status !== TopicStatus.SKIPPED)
        .map(publicTopic),
      coveredTopics: topics
        .filter(
          (topic) =>
            topic.status === TopicStatus.COMPLETED ||
            (topic.status === TopicStatus.IN_PROGRESS &&
              topic.completionPercentage > 0),
        )
        .map(publicTopic),
      comingNextTopics: topics
        .filter(
          (topic) =>
            topic.status !== TopicStatus.COMPLETED &&
            topic.status !== TopicStatus.SKIPPED,
        )
        .slice(0, 3)
        .map(publicTopic),
      topics,
    };
  });

  const exams = batch.semester.examWindows
    .filter((exam) => formatIsoDate(exam.endDate) >= asOfDate)
    .map((exam) => ({
      id: exam.id,
      name: exam.name,
      type: exam.type,
      startDate: formatIsoDate(exam.startDate),
      endDate: formatIsoDate(exam.endDate),
      syllabusDeadline: formatIsoDate(exam.syllabusDeadline),
      isOngoing: formatIsoDate(exam.startDate) < asOfDate,
      daysUntilExam: Math.max(
        0,
        daysBetween(asOfDate, formatIsoDate(exam.startDate)),
      ),
      subjects: subjects
        .map((subject) => ({
          id: subject.id,
          subject: subject.subject,
          topics: subject.topics
            .filter(
              (topic) =>
                topic.status !== TopicStatus.SKIPPED &&
                topic.examWindowIds.includes(exam.id),
            )
            .map(publicTopic),
        }))
        .filter((subject) => subject.topics.length > 0),
    }));

  return {
    asOfDate,
    batch: {
      id: batch.id,
      code: batch.code,
      name: batch.name,
      tracks: [...new Map(subjects.map((s) => [s.track.id, s.track])).values()],
      semester: {
        id: batch.semester.id,
        name: batch.semester.name,
        startDate: formatIsoDate(batch.semester.startDate),
        endDate: formatIsoDate(batch.semester.endDate),
        campus: batch.semester.campus,
      },
    },
    subjects: subjects.map(({ topics: _topics, ...subject }) => subject),
    exams,
  };
}

function publicTopic<
  T extends {
    examWindowIds: string[];
    [key: string]: unknown;
  },
>({ examWindowIds: _examWindowIds, ...topic }: T) {
  return topic;
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}
