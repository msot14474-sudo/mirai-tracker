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
  const upload = (lines: string) =>
    ({
      originalname: 'weekly.csv',
      buffer: Buffer.from('Subject,Teacher,Day,Start time,End time\n' + lines),
    }) as never;
  function importSetup() {
    const state = setup();
    state.prisma.subjectOffering.findMany.mockResolvedValue([
      { id: 'offering-a', subject: { code: 'OT101', name: 'Foundations' } },
    ]);
    state.prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({ faculty: [facultyAssignment()] }),
    );
    state.prisma.timetableEntry.findFirst.mockResolvedValue(null);
    state.prisma.$transaction.mockImplementation(async (callback) =>
      callback(state.prisma),
    );
    return state;
  }
  it('previews a full batch without writes and rejects a cross-campus request', async () => {
    const { service, prisma, access } = importSetup();
    const result = await service.importBatch(
      'batch-a',
      upload('OT101,faculty@mirai.local,Monday,09:00,10:00'),
      manager,
    );
    expect(result.valid).toBe(true);
    expect(result.rows[0]?.teacher).toBe('Faculty A');
    expect(prisma.timetableEntry.createMany).not.toHaveBeenCalled();
    access.assertCanManageCampus.mockImplementation(() => {
      throw new ForbiddenException();
    });
    await expect(
      service.importBatch(
        'batch-a',
        upload('OT101,,Monday,09:00,10:00'),
        manager,
        true,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('rejects unknown subjects, wrong teachers and overlapping file rows before writing', async () => {
    const { service, prisma } = importSetup();
    const file = upload(
      'OT101,,Monday,09:00,10:00\nOT101,,Monday,09:30,10:30\nUNKNOWN,,Tuesday,09:00,10:00\nOT101,other@example.edu,Wednesday,09:00,10:00',
    );
    const result = await service.importBatch('batch-a', file, manager);
    expect(result.errors).toHaveLength(3);
    expect(result.valid).toBe(false);
    await expect(
      service.importBatch('batch-a', file, manager, true),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.timetableEntry.createMany).not.toHaveBeenCalled();
  });
  it('commits together, regenerates each subject once and treats matching rows as idempotent', async () => {
    const { service, prisma } = importSetup();
    const generate = jest
      .spyOn(service as never, 'regenerateOffering' as never)
      .mockResolvedValue({} as never);
    const file = upload(
      'OT101,,Monday,09:00,10:00\nOT101,,Wednesday,09:00,10:00',
    );
    const result = await service.importBatch('batch-a', file, manager, true);
    expect(result.added).toBe(2);
    expect(
      prisma.timetableEntry.createMany.mock.calls[0]![0].data,
    ).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(1);
    prisma.subjectOffering.findUnique.mockResolvedValue(
      offering({
        faculty: [facultyAssignment()],
        timetableEntries: [
          entry({ facultyAssignmentId: 'faculty-assignment-a' }),
        ],
      }),
    );
    const duplicate = await service.importBatch(
      'batch-a',
      upload('OT101,,Monday,09:00,10:00'),
      manager,
      true,
    );
    expect(duplicate.added).toBe(0);
    expect(duplicate.rows[0]?.existing).toBe(true);
  });
  it('revalidates newly conflicting existing classes at commit and reports generation retries truthfully', async () => {
    const { service, prisma } = importSetup();
    const file = upload('OT101,,Monday,09:00,10:00');
    expect((await service.importBatch('batch-a', file, manager)).valid).toBe(
      true,
    );
    prisma.timetableEntry.findFirst.mockResolvedValue({
      id: 'conflict',
      offering: { batchId: 'batch-a' },
    });
    await expect(
      service.importBatch('batch-a', file, manager, true),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.timetableEntry.createMany).not.toHaveBeenCalled();
    prisma.timetableEntry.findFirst.mockResolvedValue(null);
    jest
      .spyOn(service as never, 'regenerateOffering' as never)
      .mockRejectedValue(new Error('timeout') as never);
    const result = await service.importBatch('batch-a', file, manager, true);
    expect('warnings' in result && result.warnings).toHaveLength(1);
    expect(result.added).toBe(1);
  });

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
    expect(
      transaction.scheduledSession.createMany.mock.calls[0]![0].data,
    ).toHaveLength(13);
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

  it('regenerates holiday capacity and recalculates each affected offering', async () => {
    const { service, prisma, transaction, schedules } = setup();
    prisma.subjectOffering.findMany.mockResolvedValue([{ id: 'offering-a' }]);
    const data = offering({ timetableEntries: [entry()] });
    data.batch.semester.calendarDays = [
      {
        id: 'holiday',
        date: date('2026-01-05'),
        type: 'HOLIDAY',
        title: 'Holiday',
        teachingAllowed: false,
        notes: null,
      },
    ] as never;
    prisma.subjectOffering.findUnique.mockResolvedValue(data);
    prisma.lessonPlan.findFirst.mockResolvedValue({ id: 'plan' });
    prisma.scheduledSession.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    await service.regenerateSemester('semester-a', manager);
    expect(
      transaction.scheduledSession.createMany.mock.calls[0]![0].data,
    ).toHaveLength(12);
    expect(schedules.calculate).toHaveBeenCalledWith(
      'offering-a',
      { reason: 'CALENDAR_CHANGE' },
      manager,
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
      createMany: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ count: data.length })),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    lessonPlan: { findFirst: jest.fn().mockResolvedValue(null) },
    batch: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'batch-a',
          name: 'Batch A',
          semester: offering().batch.semester,
        }),
    },
    semester: { findUnique: jest.fn() },
    subjectOffering: { findUnique: jest.fn(), findMany: jest.fn() },
    timetableEntry: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    scheduledSession: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const access = { assertCanManageCampus: jest.fn() };
  const schedules = { calculate: jest.fn().mockResolvedValue({}) };
  return {
    schedules,
    prisma,
    access,
    transaction,
    service: new TimetableService(
      prisma as never,
      access as never,
      schedules as never,
    ),
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
      active: true,
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
