import {
  ScheduledSessionStatus,
  UserRole,
  WorkingSaturdayRule,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { TimetableService } from './timetable.service';

const manager: AuthenticatedUser = {
  id: 'manager-a',
  name: 'Campus Manager',
  email: 'campus.manager@mirai.local',
  roles: [{ role: UserRole.CAMPUS_MANAGER, campusId: 'campus-a' }],
  staffProfileId: null,
  studentProfile: null,
};

describe('TimetableService', () => {
  it('derives weekly planned minutes while listing offerings', async () => {
    const { service, prisma } = setup();
    prisma.semester.findUnique.mockResolvedValue({
      id: 'semester-a',
      campusId: 'campus-a',
      name: 'Semester 2026',
      startDate: date('2026-01-01'),
      endDate: date('2026-03-31'),
    });
    prisma.subjectOffering.findMany.mockResolvedValue([
      {
        id: 'offering-a',
        subject: { id: 'subject-a', code: 'OT101', name: 'Foundations' },
        batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
        targetFinishDate: date('2026-03-20'),
        timetableEntries: [
          entry({ startTime: time('09:00'), endTime: time('10:30') }),
        ],
        _count: { sessions: 12 },
      },
    ]);

    const result = await service.listSemesterOfferings('semester-a', manager);
    expect(result.offerings[0]?.weeklyPlannedMinutes).toBe(90);
    expect(result.offerings[0]?.entries[0]?.plannedMinutes).toBe(90);
  });

  it('rejects effective dates outside the offering semester', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(offering());

    await expect(
      service.createEntry(
        'offering-a',
        input({ effectiveTo: '2026-04-01' }),
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.timetableEntry.create).not.toHaveBeenCalled();
  });

  it('requires the selected faculty assignment to cover the slot dates', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({
        faculty: [facultyAssignment({ startDate: date('2026-02-01') })],
      }),
    );

    await expect(
      service.createEntry(
        'offering-a',
        input({ facultyAssignmentId: 'faculty-assignment-a' }),
        manager,
      ),
    ).rejects.toThrow('Faculty assignment dates must cover');
  });

  it('rejects an overlapping class for the same batch', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(offering());
    prisma.timetableEntry.findFirst.mockResolvedValue({
      id: 'entry-existing',
      offering: { batchId: 'batch-a' },
    });

    await expect(
      service.createEntry('offering-a', input(), manager),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects the same faculty member overlapping across batches', async () => {
    const { service, prisma } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ faculty: [facultyAssignment()] }),
    );
    prisma.timetableEntry.findFirst.mockResolvedValue({
      id: 'entry-existing',
      offering: { batchId: 'batch-b' },
    });

    await expect(
      service.createEntry(
        'offering-a',
        input({ facultyAssignmentId: 'faculty-assignment-a' }),
        manager,
      ),
    ).rejects.toThrow(
      'The selected faculty member already has an overlapping class.',
    );
  });

  it('creates a weekly entry and generates all dated teaching sessions', async () => {
    const { service, prisma, transaction } = setup();
    const created = entry();
    prisma.subjectOffering.findUnique
      .mockResolvedValueOnce(offering())
      .mockResolvedValueOnce(offering({ timetableEntries: [created] }));
    prisma.timetableEntry.findFirst.mockResolvedValue(null);
    prisma.timetableEntry.create.mockResolvedValue(created);
    prisma.scheduledSession.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(transaction),
    );

    const result = await service.createEntry('offering-a', input(), manager);

    expect(result.entry.plannedMinutes).toBe(60);
    expect(result.generation.scheduledSessions).toBe(13);
    expect(result.generation.semesterPlannedMinutes).toBe(780);
    expect(transaction.scheduledSession.create).toHaveBeenCalledTimes(13);
  });

  it('preserves historical sessions and removes obsolete unlogged sessions', async () => {
    const { service, prisma, transaction } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ timetableEntries: [entry()] }),
    );
    prisma.scheduledSession.findMany.mockResolvedValue([
      {
        id: 'session-history',
        sourceKey: 'timetable:entry-a:2026-01-05',
        status: ScheduledSessionStatus.COMPLETED,
        _count: { logs: 1 },
      },
      {
        id: 'session-stale',
        sourceKey: 'timetable:entry-old:2026-01-06',
        status: ScheduledSessionStatus.SCHEDULED,
        _count: { logs: 0 },
      },
    ]);
    transaction.scheduledSession.deleteMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(transaction),
    );

    const result = await service.generate('offering-a', manager);
    expect(result.preserved).toBe(1);
    expect(result.removed).toBe(1);
    expect(transaction.scheduledSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session-history' } }),
    );
  });

  it('enforces campus timetable management permissions', async () => {
    const { service, prisma, access } = setup();
    prisma.subjectOffering.findUnique.mockResolvedValue(offering());
    access.assertCanManageCampus.mockImplementation(() => {
      throw new ForbiddenException();
    });

    await expect(
      service.generate('offering-a', manager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function setup() {
  const transaction = {
    scheduledSession: {
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    semester: { findUnique: jest.fn() },
    subjectOffering: { findUnique: jest.fn(), findMany: jest.fn() },
    timetableEntry: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    scheduledSession: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const access = { assertCanManageCampus: jest.fn() };
  return {
    prisma,
    access,
    transaction,
    service: new TimetableService(prisma as never, access as never),
  };
}

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offering-a',
    batchId: 'batch-a',
    subject: { id: 'subject-a', code: 'OT101', name: 'Foundations' },
    batch: {
      id: 'batch-a',
      code: 'A',
      name: 'Batch A',
      semester: {
        id: 'semester-a',
        campusId: 'campus-a',
        name: 'Semester 2026',
        startDate: date('2026-01-01'),
        endDate: date('2026-03-31'),
        workingSaturdayRule: WorkingSaturdayRule.SECOND_AND_FOURTH,
        campus: {
          id: 'campus-a',
          code: 'MAIN',
          name: 'Main Campus',
          timezone: 'Asia/Kolkata',
        },
        calendarDays: [],
      },
    },
    faculty: [],
    timetableEntries: [],
    ...overrides,
  };
}

function facultyAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'faculty-assignment-a',
    staffProfileId: 'staff-a',
    type: 'PRIMARY',
    active: true,
    startDate: date('2026-01-01'),
    endDate: date('2026-03-31'),
    staffProfile: {
      user: {
        id: 'faculty-a',
        name: 'Faculty A',
        email: 'faculty@mirai.local',
      },
    },
    ...overrides,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-a',
    offeringId: 'offering-a',
    facultyAssignmentId: null,
    weekday: 1,
    startTime: time('09:00'),
    endTime: time('10:00'),
    effectiveFrom: date('2026-01-01'),
    effectiveTo: date('2026-03-31'),
    active: true,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    weekday: 1,
    startTime: '09:00',
    endTime: '10:00',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-03-31',
    facultyAssignmentId: null,
    ...overrides,
  } as never;
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function time(value: string) {
  return new Date(`1970-01-01T${value}:00.000Z`);
}
