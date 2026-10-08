import { calculateExamReadiness } from '@mirai/calculations';
import {
  LessonPlanStatus,
  Prisma,
  SubjectOfferingStatus,
  TopicStatus,
  UserRole,
} from '@prisma/client';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatIsoDate } from '../academic-calendar/calendar-engine';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

const studentBatchInclude = Prisma.validator<Prisma.BatchInclude>()({
  track: { select: { id: true, code: true, name: true } },
  semester: {
    include: {
      campus: { select: { id: true, code: true, name: true } },
      examWindows: { orderBy: { startDate: 'asc' } },
    },
  },
  subjectOfferings: {
    where: {
      status: {
        in: [SubjectOfferingStatus.ACTIVE, SubjectOfferingStatus.COMPLETE],
      },
    },
    orderBy: { subject: { code: 'asc' } },
    include: {
      subject: { select: { id: true, code: true, name: true } },
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

    const batch = await this.prisma.batch.findUnique({
      where: { id: user.studentProfile.batchId },
      include: studentBatchInclude,
    });
    if (!batch) throw new NotFoundException('Student batch not found.');

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

    return {
      id: offering.id,
      subject: offering.subject,
      lessonPlan: plan
        ? { id: plan.id, version: plan.version, status: plan.status }
        : null,
      scheduleVersion: offering.scheduleVersions[0]?.version ?? null,
      plannedHours: calculation.plannedHours,
      coveredHours: calculation.coveredHours,
      coveragePercentage: calculation.coveragePercentage,
      totalTopics: calculation.topicsInScope,
      completedTopics: calculation.completedTopics,
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
    .filter((exam) => formatIsoDate(exam.startDate) >= asOfDate)
    .map((exam) => ({
      id: exam.id,
      name: exam.name,
      type: exam.type,
      startDate: formatIsoDate(exam.startDate),
      endDate: formatIsoDate(exam.endDate),
      syllabusDeadline: formatIsoDate(exam.syllabusDeadline),
      daysUntilExam: daysBetween(asOfDate, formatIsoDate(exam.startDate)),
      subjects: subjects
        .map((subject) => ({
          id: subject.id,
          subject: subject.subject,
          topics: subject.topics
            .filter((topic) => topic.examWindowIds.includes(exam.id))
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
      track: batch.track,
      semester: {
        id: batch.semester.id,
        name: batch.semester.name,
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
