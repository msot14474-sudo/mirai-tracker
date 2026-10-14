import {
  ExamType,
  LessonPlanStatus,
  SubjectOfferingStatus,
  TopicStatus,
  UserRole,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/auth.types';
import { StudentViewController } from './student-view.controller';
import { StudentViewService } from './student-view.service';

const student: AuthenticatedUser = {
  id: 'user-student',
  name: 'Sample Student',
  email: 'student@mirai.local',
  roles: [{ role: UserRole.STUDENT, campusId: 'campus-a' }],
  staffProfileId: null,
  studentProfile: { id: 'student-a', batchId: 'batch-a' },
};

describe('StudentViewService', () => {
  it('loads only the authenticated student batch', async () => {
    const { service, prisma } = setup();
    prisma.batch.findUnique.mockResolvedValue(batch());

    await service.overview('2026-10-08', student);

    expect(prisma.batch.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'batch-a' } }),
    );
  });

  it('separates covered work from the next unfinished topics', async () => {
    const { service, prisma } = setup();
    prisma.batch.findUnique.mockResolvedValue(batch());

    const result = await service.overview('2026-10-08', student);

    expect(result.subjects[0]).toMatchObject({
      subject: { code: 'CS-DSA', name: 'Data Structures' },
      plannedHours: 6,
      coveredHours: 3.5,
      coveragePercentage: 58.33,
      totalTopics: 3,
      completedTopics: 1,
      coveredTopics: [
        expect.objectContaining({ title: 'Arrays', status: 'COMPLETED' }),
        expect.objectContaining({
          title: 'Linked Lists',
          status: 'IN_PROGRESS',
          completionPercentage: 50,
        }),
      ],
      comingNextTopics: [
        expect.objectContaining({ title: 'Linked Lists' }),
        expect.objectContaining({
          title: 'Queues',
          plannedStartDate: '2026-10-20',
        }),
      ],
    });
  });

  it('shows only upcoming exams with their exact subject scope', async () => {
    const { service, prisma } = setup();
    prisma.batch.findUnique.mockResolvedValue(batch());

    const result = await service.overview('2026-10-08', student);

    expect(result.exams.map((exam) => exam.name)).toEqual([
      'Mid-term 2026',
      'End-term 2026',
    ]);
    expect(result.exams[0]).toMatchObject({
      daysUntilExam: 4,
      subjects: [
        {
          subject: expect.objectContaining({ code: 'CS-DSA' }),
          topics: [
            expect.objectContaining({ title: 'Arrays' }),
            expect.objectContaining({ title: 'Linked Lists' }),
          ],
        },
      ],
    });
    expect(result.exams.at(1)?.subjects.at(0)?.topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Queues' })]),
    );
  });

  it('rejects users without a student profile before querying data', async () => {
    const { service, prisma } = setup();
    await expect(
      service.overview('2026-10-08', {
        ...student,
        roles: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
        studentProfile: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.batch.findUnique).not.toHaveBeenCalled();
  });
});

describe('StudentViewController role contract', () => {
  it('requires the student role for course views and lecture feedback', () => {
    expect(
      Reflect.getMetadata(REQUIRED_ROLES_KEY, StudentViewController),
    ).toEqual([UserRole.STUDENT]);
    expect(
      Object.getOwnPropertyNames(StudentViewController.prototype).filter(
        (name) => name !== 'constructor',
      ),
    ).toEqual(['listLectures', 'reviewLecture', 'overview']);
  });
});

function setup() {
  const prisma = { batch: { findUnique: jest.fn() } };
  return {
    prisma,
    service: new StudentViewService(prisma as never),
  };
}

function batch() {
  return {
    id: 'batch-a',
    code: 'A',
    name: 'Batch A',
    track: { id: 'track-a', code: 'MIRAI', name: 'Mirai Track' },
    semester: {
      id: 'semester-a',
      name: 'Semester 2026',
      campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
      examWindows: [
        exam('past', 'Sessional 1', ExamType.SESSIONAL, '2026-09-20'),
        exam('mid', 'Mid-term 2026', ExamType.MID_TERM, '2026-10-12'),
        exam('end', 'End-term 2026', ExamType.END_TERM, '2026-12-07'),
      ],
    },
    subjectOfferings: [
      {
        id: 'offering-a',
        status: SubjectOfferingStatus.ACTIVE,
        subject: {
          id: 'subject-a',
          code: 'CS-DSA',
          name: 'Data Structures',
        },
        lessonPlans: [
          {
            id: 'plan-a',
            version: 1,
            status: LessonPlanStatus.ACTIVE,
            units: [
              {
                sequence: 1,
                title: 'Linear structures',
                topics: [
                  topic(
                    'topic-a',
                    1,
                    'Arrays',
                    120,
                    TopicStatus.COMPLETED,
                    100,
                    ['mid', 'end'],
                  ),
                  topic(
                    'topic-b',
                    2,
                    'Linked Lists',
                    180,
                    TopicStatus.IN_PROGRESS,
                    50,
                    ['mid', 'end'],
                  ),
                  topic(
                    'topic-c',
                    3,
                    'Queues',
                    60,
                    TopicStatus.NOT_STARTED,
                    0,
                    ['end'],
                  ),
                  topic(
                    'topic-d',
                    4,
                    'Legacy topic',
                    60,
                    TopicStatus.SKIPPED,
                    0,
                    ['end'],
                  ),
                ],
              },
            ],
          },
        ],
        scheduleVersions: [
          {
            version: 4,
            entries: [
              schedule('topic-a', '2026-09-01', '2026-09-05'),
              schedule('topic-b', '2026-10-01', '2026-10-15'),
              schedule('topic-c', '2026-10-20', '2026-10-25'),
            ],
          },
        ],
      },
    ],
  };
}

function exam(id: string, name: string, type: ExamType, startDate: string) {
  return {
    id,
    name,
    type,
    startDate: date(startDate),
    endDate: date(startDate),
    syllabusDeadline: date(startDate),
  };
}

function topic(
  id: string,
  sequence: number,
  title: string,
  plannedMinutes: number,
  status: TopicStatus,
  currentCompletionPercentage: number,
  examWindowIds: string[],
) {
  return {
    id,
    sequence,
    title,
    plannedMinutes,
    status,
    currentCompletionPercentage,
    examScopes: examWindowIds.map((examWindowId) => ({ examWindowId })),
  };
}

function schedule(
  topicId: string,
  plannedStartDate: string,
  plannedFinishDate: string,
) {
  return {
    topicId,
    plannedStartDate: date(plannedStartDate),
    plannedFinishDate: date(plannedFinishDate),
  };
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
