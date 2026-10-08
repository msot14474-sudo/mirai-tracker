import {
  AlertStatus,
  LessonPlanStatus,
  NotificationStatus,
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
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { SessionLogService } from './session-log.service';

const faculty: AuthenticatedUser = {
  id: 'user-faculty',
  name: 'Faculty',
  email: 'faculty@mirai.local',
  roles: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
  staffProfileId: 'staff-a',
  studentProfile: null,
};

describe('SessionLogService', () => {
  it('lists only assigned classes for the requested date', async () => {
    const { service, prisma } = setup();
    prisma.scheduledSession.findMany
      .mockResolvedValueOnce([session()])
      .mockResolvedValueOnce([]);

    const result = await service.listForDate('2026-10-08', faculty);

    expect(result.sessions).toHaveLength(1);
    expect(prisma.scheduledSession.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          sessionDate: date('2026-10-08'),
          offering: {
            faculty: {
              some: expect.objectContaining({ staffProfileId: 'staff-a' }),
            },
          },
        }),
      }),
    );
  });

  it('prefills the current topic and derives completion from class minutes', async () => {
    const { service, prisma } = setup();
    prisma.scheduledSession.findMany
      .mockResolvedValueOnce([session()])
      .mockResolvedValueOnce([]);

    const result = await service.listForDate('2026-10-08', faculty);
    expect(result.sessions[0]?.prefill).toMatchObject({
      status: SessionLogStatus.COMPLETED,
      coveredSummary: 'Arrays',
      leftOverSummary: 'Continue Arrays',
      carryForwardTopicId: 'topic-a',
      topicUpdates: [
        {
          topicId: 'topic-a',
          completionAfterPercentage: 50,
          minutesUsed: 60,
        },
      ],
    });
  });

  it('prefers the active lesson plan over a newer draft', async () => {
    const { service, prisma } = setup();
    prisma.scheduledSession.findMany
      .mockResolvedValueOnce([
        session({
          plans: [
            plan({
              id: 'draft-new',
              version: 2,
              status: LessonPlanStatus.DRAFT,
              topicId: 'draft-topic',
              title: 'Draft topic',
            }),
            plan({ id: 'active-plan', status: LessonPlanStatus.ACTIVE }),
          ],
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await service.listForDate('2026-10-08', faculty);

    expect(result.sessions[0]?.plan?.id).toBe('active-plan');
    expect(result.sessions[0]?.prefill.coveredSummary).toBe('Arrays');
  });

  it('creates a revision, advances topics and updates the session atomically', async () => {
    const { service, prisma, transaction } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue(session());
    transaction.sessionLog.create.mockResolvedValue(savedLog());

    const result = await service.create('session-a', input(), faculty);

    expect(result).toMatchObject({ revision: 1, status: 'COMPLETED' });
    expect(transaction.sessionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revision: 1,
          loggedById: 'user-faculty',
          topicUpdates: {
            create: [
              expect.objectContaining({
                topicId: 'topic-a',
                completionBeforePercentage: 0,
                completionAfterPercentage: 50,
              }),
            ],
          },
        }),
      }),
    );
    expect(transaction.topic.update).toHaveBeenCalledWith({
      where: { id: 'topic-a' },
      data: {
        currentCompletionPercentage: 50,
        status: TopicStatus.IN_PROGRESS,
      },
    });
    expect(transaction.scheduledSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ScheduledSessionStatus.COMPLETED,
        }),
      }),
    );
    expect(transaction.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        alert: { scheduledSessionId: 'session-a' },
        status: NotificationStatus.QUEUED,
      },
      data: { status: NotificationStatus.CANCELLED },
    });
    expect(transaction.missedLogAlert.updateMany).toHaveBeenCalledWith({
      where: {
        scheduledSessionId: 'session-a',
        status: { in: [AlertStatus.PENDING, AlertStatus.FAILED] },
      },
      data: { status: AlertStatus.CANCELLED },
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ clientElapsedSeconds: 18.4 }),
        }),
      }),
    );
  });

  it('increments the revision when correcting an existing log', async () => {
    const { service, prisma, transaction } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue(
      session({ logs: [savedLog({ revision: 2 })] }),
    );
    transaction.sessionLog.create.mockResolvedValue(savedLog({ revision: 3 }));

    const result = await service.create('session-a', input(), faculty);

    expect(result.revision).toBe(3);
    expect(transaction.sessionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revision: 3 }),
      }),
    );
  });

  it('recalculates planned dates when a class is cancelled', async () => {
    const { service, prisma, transaction, schedules } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue(session());
    transaction.sessionLog.create.mockResolvedValue(
      savedLog({ status: SessionLogStatus.CANCELLED, topicUpdates: [] }),
    );

    await service.create(
      'session-a',
      input({
        status: SessionLogStatus.CANCELLED,
        overallCompletionPercentage: 0,
        coveredSummary: 'Session cancelled',
        cancellationReason: 'Campus closure',
        carryForwardTopicId: null,
        topicUpdates: [],
      }),
      faculty,
    );

    expect(schedules.calculate).toHaveBeenCalledWith(
      'offering-a',
      { reason: 'SESSION_CANCELLED' },
      faculty,
    );
  });

  it('rejects topics from another lesson plan and backward progress', async () => {
    const { service, prisma } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue(session());
    await expect(
      service.create(
        'session-a',
        input({
          topicUpdates: [
            {
              topicId: 'foreign-topic',
              completionAfterPercentage: 50,
              minutesUsed: 60,
            },
          ],
        }),
        faculty,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.scheduledSession.findUnique.mockResolvedValue(
      session({ completion: 60 }),
    );
    await expect(
      service.create('session-a', input(), faculty),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects topic minutes beyond the scheduled class duration', async () => {
    const { service, prisma } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue(session());

    await expect(
      service.create(
        'session-a',
        input({
          topicUpdates: [
            {
              topicId: 'topic-a',
              completionAfterPercentage: 50,
              minutesUsed: 61,
            },
          ],
        }),
        faculty,
      ),
    ).rejects.toThrow('cannot exceed');
  });

  it('prevents unassigned faculty from writing a session log', async () => {
    const { service, prisma, transaction } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue(
      session({ staffProfileId: 'staff-other' }),
    );

    await expect(
      service.create('session-a', input(), faculty),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.sessionLog.create).not.toHaveBeenCalled();
  });
});

function setup() {
  const transaction = {
    sessionLog: { create: jest.fn() },
    topic: { update: jest.fn() },
    scheduledSession: { update: jest.fn() },
    notificationDelivery: { updateMany: jest.fn() },
    missedLogAlert: { updateMany: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    scheduledSession: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    ),
  };
  const schedules = {
    calculate: jest.fn().mockResolvedValue({
      version: { id: 'schedule-2', version: 2 },
    }),
  };
  return {
    prisma,
    transaction,
    schedules,
    service: new SessionLogService(prisma as never, schedules as never),
  };
}

function session({
  staffProfileId = 'staff-a',
  completion = 0,
  logs = [],
  plans,
}: {
  staffProfileId?: string;
  completion?: number;
  logs?: unknown[];
  plans?: unknown[];
} = {}) {
  return {
    id: 'session-a',
    sourceKey: 'source-a',
    offeringId: 'offering-a',
    timetableEntryId: 'entry-a',
    facultyAssignmentId: 'assignment-a',
    sessionDate: date('2026-10-08'),
    startsAt: new Date('2026-10-08T03:30:00.000Z'),
    endsAt: new Date('2026-10-08T04:30:00.000Z'),
    status: ScheduledSessionStatus.SCHEDULED,
    isExtraSession: false,
    cancellationReason: null,
    mergedIntoSessionId: null,
    logs,
    offering: {
      subject: { id: 'subject-a', code: 'CS-DSA', name: 'Data Structures' },
      batch: {
        id: 'batch-a',
        code: 'A',
        name: 'Batch A',
        semester: {
          id: 'semester-a',
          campus: {
            id: 'campus-a',
            code: 'MAIN',
            name: 'Main Campus',
            timezone: 'Asia/Kolkata',
          },
        },
      },
      faculty: [
        {
          staffProfileId,
          active: true,
          startDate: date('2026-07-01'),
          endDate: null,
        },
      ],
      lessonPlans: plans ?? [plan({ currentCompletionPercentage: completion })],
      scheduleVersions: [
        {
          entries: [
            {
              topicId: 'topic-a',
              plannedStartDate: date('2026-10-08'),
              plannedFinishDate: date('2026-10-15'),
            },
          ],
        },
      ],
    },
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  const {
    id = 'plan-a',
    version = 1,
    status = LessonPlanStatus.ACTIVE,
    topicId = 'topic-a',
    title = 'Arrays',
    currentCompletionPercentage = 0,
  } = overrides;
  return {
    id,
    version,
    status,
    units: [
      {
        id: 'unit-a',
        sequence: 1,
        title: 'Foundations',
        topics: [
          {
            id: topicId,
            sequence: 1,
            title,
            plannedMinutes: 120,
            status: TopicStatus.NOT_STARTED,
            currentCompletionPercentage,
          },
        ],
      },
    ],
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    status: SessionLogStatus.COMPLETED,
    overallCompletionPercentage: 100,
    coveredSummary: 'Arrays',
    leftOverSummary: 'Continue Arrays',
    carryForwardTopicId: 'topic-a',
    classworkStatus: WorkStatus.NOT_ASSIGNED,
    homeworkStatus: WorkStatus.NOT_ASSIGNED,
    notes: null,
    mergedIntoSessionId: null,
    cancellationReason: null,
    clientElapsedSeconds: 18.4,
    topicUpdates: [
      {
        topicId: 'topic-a',
        completionAfterPercentage: 50,
        minutesUsed: 60,
        notes: null,
      },
    ],
    ...overrides,
  } as never;
}

function savedLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-a',
    revision: 1,
    status: SessionLogStatus.COMPLETED,
    overallCompletionPercentage: 100,
    coveredSummary: 'Arrays',
    leftOverSummary: 'Continue Arrays',
    carryForwardTopicId: 'topic-a',
    classworkStatus: WorkStatus.NOT_ASSIGNED,
    homeworkStatus: WorkStatus.NOT_ASSIGNED,
    notes: null,
    loggedAt: new Date('2026-10-08T05:00:00.000Z'),
    topicUpdates: [
      {
        id: 'update-a',
        topicId: 'topic-a',
        completionBeforePercentage: 0,
        completionAfterPercentage: 50,
        minutesUsed: 60,
        notes: null,
      },
    ],
    ...overrides,
  };
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
