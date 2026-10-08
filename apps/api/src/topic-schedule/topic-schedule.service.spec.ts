import {
  LessonPlanStatus,
  ScheduleCalculationReason,
  ScheduledSessionStatus,
  UserRole,
} from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { TopicScheduleService } from './topic-schedule.service';

const faculty: AuthenticatedUser = {
  id: 'user-faculty',
  name: 'Faculty',
  email: 'faculty@mirai.local',
  roles: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
  staffProfileId: 'staff-a',
  studentProfile: null,
};

describe('TopicScheduleService', () => {
  it('limits the offering list to assigned faculty', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([]);

    await service.listOfferings(faculty);

    expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              faculty: {
                some: { staffProfileId: 'staff-a', active: true },
              },
            },
          ],
        },
      }),
    );
  });

  it('returns a live preview using the active plan in preference to a newer draft', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({
        lessonPlans: [
          plan({ id: 'draft-new', version: 2, status: LessonPlanStatus.DRAFT }),
          plan({ id: 'active', version: 1, status: LessonPlanStatus.ACTIVE }),
        ],
      }),
    );

    const result = await service.offering('offering-a', faculty);

    expect(result.plan?.id).toBe('active');
    expect(result.preview.allocations[0]).toMatchObject({
      id: 'topic-a',
      plannedStartDate: '2026-07-01',
      plannedFinishDate: '2026-07-03',
      afterTarget: false,
    });
  });

  it('persists the next calculation version and its complete topic entries', async () => {
    const { service, prisma, transaction } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ scheduleVersions: [scheduleVersion(3)] }),
    );
    transaction.topicScheduleVersion.create.mockImplementation(
      ({
        data,
      }: {
        data: { version: number; reason: ScheduleCalculationReason };
      }) =>
        Promise.resolve({
          id: 'schedule-new',
          version: data.version,
          reason: data.reason,
          calculatedAt: new Date('2026-10-08T10:00:00.000Z'),
          entries: [
            {
              id: 'entry-a',
              topicId: 'topic-a',
              plannedStartDate: date('2026-07-01'),
              plannedFinishDate: date('2026-07-03'),
              allocatedMinutes: 90,
            },
          ],
        }),
    );

    const result = await service.calculate(
      'offering-a',
      { reason: ScheduleCalculationReason.CALENDAR_CHANGE },
      faculty,
    );

    expect(result.version).toMatchObject({
      version: 4,
      reason: ScheduleCalculationReason.CALENDAR_CHANGE,
    });
    expect(transaction.topicScheduleVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 4,
          reason: ScheduleCalculationReason.CALENDAR_CHANGE,
          entries: {
            create: expect.arrayContaining([
              expect.objectContaining({
                topicId: 'topic-a',
                allocatedMinutes: 90,
              }),
            ]),
          },
        }),
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalled();
  });

  it('cancels an unlogged class and immediately creates a shifted version', async () => {
    const { service, prisma, transaction } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue({
      ...classSession('session-two', '2026-07-03'),
      offeringId: 'offering-a',
      cancellationReason: null,
      _count: { logs: 0 },
      offering: {
        batch: { semester: { campus: { id: 'campus-a' } } },
      },
    });
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({
        sessions: [
          classSession('session-one', '2026-07-01'),
          classSession(
            'session-two',
            '2026-07-03',
            ScheduledSessionStatus.CANCELLED,
          ),
          classSession('session-three', '2026-07-08'),
        ],
      }),
    );
    transaction.topicScheduleVersion.create.mockResolvedValue({
      id: 'schedule-new',
      version: 1,
      reason: ScheduleCalculationReason.SESSION_CANCELLED,
      calculatedAt: new Date('2026-10-08T10:00:00.000Z'),
      entries: [],
    });

    const result = await service.setSessionCancellation(
      'session-two',
      { cancelled: true, reason: 'Faculty unavailable' },
      faculty,
    );

    expect(transaction.scheduledSession.update).toHaveBeenCalledWith({
      where: { id: 'session-two' },
      data: {
        status: ScheduledSessionStatus.CANCELLED,
        cancellationReason: 'Faculty unavailable',
      },
    });
    expect(result.version.reason).toBe(
      ScheduleCalculationReason.SESSION_CANCELLED,
    );
    expect(result.preview.summary.excludedSessions).toBe(1);
  });

  it('protects logged sessions from cancellation', async () => {
    const { service, prisma, transaction } = setup();
    prisma.scheduledSession.findUnique.mockResolvedValue({
      ...classSession('session-a', '2026-07-01'),
      offeringId: 'offering-a',
      cancellationReason: null,
      _count: { logs: 1 },
      offering: {
        batch: { semester: { campus: { id: 'campus-a' } } },
      },
    });

    await expect(
      service.setSessionCancellation(
        'session-a',
        { cancelled: true, reason: 'Unavailable' },
        faculty,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.scheduledSession.update).not.toHaveBeenCalled();
  });

  it('requires a lesson plan before persisting dates', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ lessonPlans: [] }),
    );

    await expect(
      service.calculate('offering-a', {}, faculty),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function setup() {
  const transaction = {
    topicScheduleVersion: { create: jest.fn() },
    scheduledSession: { update: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    subjectOffering: { findMany: jest.fn(), findUnique: jest.fn() },
    scheduledSession: { findUnique: jest.fn() },
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    ),
  };
  const access = {
    isGlobalManager: jest.fn().mockReturnValue(false),
    assertCanManageOffering: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    access,
    transaction,
    service: new TopicScheduleService(prisma as never, access as never),
  };
}

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offering-a',
    targetFinishDate: date('2026-08-01'),
    subject: { id: 'subject-a', code: 'CS-DSA', name: 'Data Structures' },
    batch: {
      id: 'batch-a',
      code: 'A',
      name: 'Batch A',
      semester: {
        id: 'semester-a',
        name: 'Semester 2026',
        startDate: date('2026-07-01'),
        endDate: date('2026-12-15'),
        campus: {
          id: 'campus-a',
          code: 'MAIN',
          name: 'Main Campus',
          timezone: 'Asia/Kolkata',
        },
      },
    },
    lessonPlans: [plan()],
    sessions: [
      classSession('session-one', '2026-07-01'),
      classSession('session-two', '2026-07-03'),
      classSession('session-three', '2026-07-08'),
    ],
    scheduleVersions: [],
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
        title: 'Foundations',
        topics: [
          {
            id: 'topic-a',
            sequence: 1,
            title: 'Arrays',
            plannedMinutes: 90,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function classSession(
  id: string,
  sessionDate: string,
  status: ScheduledSessionStatus = ScheduledSessionStatus.SCHEDULED,
) {
  return {
    id,
    sessionDate: date(sessionDate),
    startsAt: new Date(`${sessionDate}T09:00:00.000Z`),
    endsAt: new Date(`${sessionDate}T10:00:00.000Z`),
    status,
    cancellationReason: null,
    isExtraSession: false,
    _count: { logs: 0 },
  };
}

function scheduleVersion(version: number) {
  return {
    id: `schedule-${version}`,
    version,
    reason: ScheduleCalculationReason.MANUAL_RECALCULATION,
    calculatedAt: new Date('2026-10-08T09:00:00.000Z'),
    entries: [],
  };
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
