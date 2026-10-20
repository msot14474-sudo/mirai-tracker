import {
  ExamType,
  LessonPlanStatus,
  ProgressStatus,
  ScheduledSessionStatus,
  SubjectOfferingStatus,
  TopicStatus,
  UserRole,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { ProgressService } from './progress.service';

const faculty: AuthenticatedUser = {
  id: 'user-faculty',
  name: 'Faculty',
  email: 'faculty@mirai.local',
  roles: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
  staffProfileId: 'staff-a',
  studentProfile: null,
};

const student: AuthenticatedUser = {
  id: 'user-student',
  name: 'Student',
  email: 'student@mirai.local',
  roles: [{ role: UserRole.STUDENT, campusId: 'campus-a' }],
  staffProfileId: null,
  studentProfile: { id: 'student-a', batchId: 'batch-a' },
};

describe('ProgressService', () => {
  it('limits a faculty list to active assignments', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([offering()]);

    await service.list('2026-10-08', faculty);

    expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                {
                  batch: { semester: { campusId: { in: ['campus-a'] } } },
                  faculty: {
                    some: { staffProfileId: 'staff-a', active: true },
                  },
                },
              ],
            },
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
      }),
    );
  });

  it('limits a student list to the enrolled batch', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([]);

    await service.list('2026-10-08', student);

    expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ OR: [{ batchId: 'batch-a' }] }]),
        }),
      }),
    );
  });

  it('matches the hand-calculated subject result to two decimals', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(offering());

    const result = await service.subject('offering-a', '2026-10-08', faculty);

    expect(result).toMatchObject({
      hoursInScope: 6,
      coveredHours: 3.5,
      coveragePercentage: 58.33,
      remainingHours: 2.5,
      availableHours: 3,
      plannedHoursByToday: 4,
      paceVsPlanHours: -0.5,
      bufferRatio: 1.2,
      status: ProgressStatus.ON_TRACK,
      overdueTopics: [
        expect.objectContaining({ id: 'topic-b', title: 'Linked Lists' }),
      ],
    });
  });

  it('builds campus and track dashboards from scoped subjects', async () => {
    const { service, prisma } = setup();
    const manyFutureSessions = Array.from({ length: 12 }, (_, index) =>
      classSession(index + 12, 'SCHEDULED'),
    );
    prisma.subjectOffering.findMany.mockResolvedValue([
      offering({
        sessions: [
          ...[1, 2, 3, 4].map((day) => classSession(day, 'COMPLETED')),
          ...manyFutureSessions,
        ],
      }),
      offering({
        id: 'offering-danger',
        subject: {
          id: 'subject-danger',
          code: 'PHY-201',
          name: 'Physics',
        },
        sessions: [
          ...[1, 2, 3, 4].map((day) => classSession(day, 'COMPLETED')),
        ],
      }),
    ]);

    const result = await service.dashboard('2026-10-08', faculty);

    expect(result.summary).toMatchObject({
      subjectCount: 2,
      status: ProgressStatus.DANGER,
      bufferRatio: 2.4,
    });
    expect(result.campuses).toEqual([
      expect.objectContaining({
        id: 'campus-a',
        name: 'Main Campus',
        subjectCount: 2,
        status: ProgressStatus.DANGER,
      }),
    ]);
    expect(result.tracks).toEqual([
      expect.objectContaining({
        id: 'MIRAI',
        name: 'Mirai',
        subjectCount: 2,
        status: ProgressStatus.DANGER,
      }),
    ]);
  });

  it('returns an empty dashboard when the current scope has no subjects', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([]);

    await expect(
      service.dashboard('2026-10-08', faculty),
    ).resolves.toMatchObject({
      summary: null,
      campuses: [],
      tracks: [],
      subjects: [],
    });
  });

  it('calculates mid-term and end-term readiness from only mapped topics', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([offering()]);

    const result = await service.examReadiness('2026-10-08', faculty);

    expect(result.exams.map((exam) => exam.name)).toEqual([
      'Mid-term 2026',
      'End-term 2026',
    ]);
    expect(result.exams[0]).toMatchObject({
      type: ExamType.MID_TERM,
      daysUntilExam: 4,
      deadlinePassed: false,
      topicsInScope: 2,
      completedTopics: 1,
      plannedHours: 5,
      coveredHours: 3.5,
      coveragePercentage: 70,
      hoursStillNeeded: 1.5,
      subjects: [
        expect.objectContaining({
          subject: expect.objectContaining({ code: 'CS-DSA' }),
          topicsInScope: 2,
          coveragePercentage: 70,
          hoursStillNeeded: 1.5,
        }),
      ],
    });
    expect(result.exams[1]).toMatchObject({
      type: ExamType.END_TERM,
      topicsInScope: 3,
      plannedHours: 6,
      coveredHours: 3.5,
      coveragePercentage: 58.33,
      hoursStillNeeded: 2.5,
    });
  });

  it('keeps an upcoming exam visible when no topics have been mapped', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([
      offering({ lessonPlans: [plan({ units: [] })] }),
    ]);

    const result = await service.examReadiness('2026-10-08', faculty);

    expect(result.exams).toHaveLength(2);
    expect(result.exams[0]).toMatchObject({
      coveragePercentage: null,
      hoursStillNeeded: 0,
      subjects: [],
    });
  });

  it('calculates exam buffer only through its deadline using configured offering thresholds', async () => {
    const { service, prisma } = setup();
    const record = offering({ onTrackThreshold: 3, tightThreshold: 2 });
    prisma.subjectOffering.findMany.mockResolvedValue([record]);
    const result = await service.examReadiness('2026-10-08', faculty);
    for (const [index, exam] of result.exams.entries()) {
      const subject = exam.subjects[0] as { buffer: { availableHours: number; remainingHours: number; status: string; thresholds: unknown } };
      expect(subject.buffer.availableHours).toBe(index === 0 ? 0 : 3);
      expect(subject.buffer.thresholds).toEqual({ onTrack: 3, tight: 2 });
      expect(subject.buffer.status).toBe('DANGER');
    }
  });

  it('uses an active lesson plan instead of a newer draft', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({
        lessonPlans: [
          plan({
            id: 'draft-new',
            version: 2,
            status: LessonPlanStatus.DRAFT,
          }),
          plan({ id: 'active', version: 1, status: LessonPlanStatus.ACTIVE }),
        ],
      }),
    );

    const result = await service.subject('offering-a', '2026-10-08', faculty);

    expect(result.lessonPlan).toMatchObject({ id: 'active', version: 1 });
  });

  it('stores a versioned snapshot and a traceable audit record', async () => {
    const { service, prisma, transaction } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ progressSnapshots: [{ calculationVersion: 2 }] }),
    );
    transaction.progressSnapshot.create.mockResolvedValue({
      id: 'snapshot-3',
      calculationVersion: 3,
      calculatedAt: new Date('2026-10-08T12:00:00.000Z'),
    });

    const result = await service.snapshot('offering-a', '2026-10-08', faculty);

    expect(result.snapshot.version).toBe(3);
    expect(transaction.progressSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        offeringId: 'offering-a',
        calculationVersion: 3,
        hoursInScopeMinutes: 360,
        coveredMinutes: 210,
        remainingMinutes: 150,
        availableMinutes: 180,
        coveragePercentage: 58.33,
        bufferRatio: 1.2,
        paceMinutes: -30,
        status: ProgressStatus.ON_TRACK,
      }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'ProgressSnapshot',
          entityId: 'snapshot-3',
          metadata: expect.objectContaining({ lessonPlanId: 'plan-a' }),
        }),
      }),
    );
  });

  it('uses offering thresholds before semester defaults', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ onTrackThreshold: 1.25, tightThreshold: 1.1 }),
    );

    const result = await service.subject('offering-a', '2026-10-08', faculty);

    expect(result.thresholds).toEqual({ onTrack: 1.25, tight: 1.1 });
    expect(result.status).toBe(ProgressStatus.TIGHT);
  });

  it('requires a lesson plan before calculating progress', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ lessonPlans: [] }),
    );

    await expect(
      service.subject('offering-a', '2026-10-08', faculty),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function setup() {
  const transaction = {
    progressSnapshot: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    subjectOffering: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    ),
  };
  const access = {
    isGlobalManager: jest.fn().mockReturnValue(false),
    assertCanViewOffering: jest.fn(),
    assertCanManageOffering: jest.fn(),
  };
  return {
    prisma,
    transaction,
    access,
    service: new ProgressService(prisma as never, access as never),
  };
}

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offering-a',
    batchId: 'batch-a',
    subjectId: 'subject-a',
    targetFinishDate: date('2026-11-30'),
    onTrackThreshold: null,
    tightThreshold: null,
    status: SubjectOfferingStatus.ACTIVE,
    subject: {
      id: 'subject-a',
      code: 'CS-DSA',
      name: 'Data Structures',
    },
    academicTrack: 'MIRAI',
    batch: {
      id: 'batch-a',
      code: 'A',
      name: 'Batch A',
      track: { id: 'track-a', code: 'MIRAI', name: 'Mirai Track' },
      semester: {
        id: 'semester-a',
        name: 'Semester 2026',
        defaultOnTrackThreshold: 1.15,
        defaultTightThreshold: 1,
        examWindows: [
          examWindow(
            'exam-past',
            'Sessional 1',
            ExamType.SESSIONAL,
            '2026-09-20',
            '2026-09-21',
            '2026-09-18',
          ),
          examWindow(
            'exam-mid',
            'Mid-term 2026',
            ExamType.MID_TERM,
            '2026-10-12',
            '2026-10-16',
            '2026-10-09',
          ),
          examWindow(
            'exam-end',
            'End-term 2026',
            ExamType.END_TERM,
            '2026-12-07',
            '2026-12-12',
            '2026-12-04',
          ),
        ],
        campus: {
          id: 'campus-a',
          code: 'MAIN',
          name: 'Main Campus',
        },
      },
    },
    lessonPlans: [plan()],
    sessions: [
      ...[1, 2, 3, 4].map((day) => classSession(day, 'COMPLETED')),
      ...[12, 13, 14].map((day) => classSession(day, 'SCHEDULED')),
    ],
    scheduleVersions: [
      {
        version: 4,
        entries: [
          schedule('topic-a', '2026-09-01'),
          schedule('topic-b', '2026-10-01'),
          schedule('topic-c', '2026-11-01'),
        ],
      },
    ],
    progressSnapshots: [],
    ...overrides,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-a',
    version: 1,
    status: LessonPlanStatus.ACTIVE,
    units: [
      {
        id: 'unit-a',
        sequence: 1,
        topics: [
          progressTopic('topic-a', 'Arrays', 120, TopicStatus.COMPLETED, 100),
          progressTopic(
            'topic-b',
            'Linked Lists',
            180,
            TopicStatus.IN_PROGRESS,
            50,
          ),
          progressTopic('topic-c', 'Queues', 60, TopicStatus.NOT_STARTED, 0),
        ],
      },
    ],
    ...overrides,
  };
}

function progressTopic(
  id: string,
  title: string,
  plannedMinutes: number,
  status: TopicStatus,
  completion: number,
) {
  return {
    id,
    sequence: 1,
    title,
    plannedMinutes,
    status,
    currentCompletionPercentage: completion,
    examScopes: (id === 'topic-c'
      ? ['exam-end']
      : ['exam-mid', 'exam-end']
    ).map((examWindowId) => ({ examWindowId })),
  };
}

function examWindow(
  id: string,
  name: string,
  type: ExamType,
  startDate: string,
  endDate: string,
  syllabusDeadline: string,
) {
  return {
    id,
    name,
    type,
    startDate: date(startDate),
    endDate: date(endDate),
    syllabusDeadline: date(syllabusDeadline),
  };
}

function classSession(day: number, status: string) {
  const dayText = String(day).padStart(2, '0');
  return {
    id: `session-${day}`,
    sessionDate: date(`2026-10-${dayText}`),
    startsAt: new Date(`2026-10-${dayText}T03:30:00.000Z`),
    endsAt: new Date(`2026-10-${dayText}T04:30:00.000Z`),
    status: status as ScheduledSessionStatus,
  };
}

function schedule(topicId: string, plannedFinishDate: string) {
  return {
    topicId,
    plannedStartDate: date(plannedFinishDate),
    plannedFinishDate: date(plannedFinishDate),
  };
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

it('filters the campus before aggregating progress', async () => {
  const { service, prisma } = setup();
  prisma.subjectOffering.findMany.mockResolvedValue([]);
  const result = await service.dashboard('2026-10-16', faculty, 'campus-b');
  expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { batch: { semester: { campusId: 'campus-b' } } },
        ]),
      },
    }),
  );
  expect(result.subjects).toEqual([]);
  expect(result.summary).toBeNull();
});
