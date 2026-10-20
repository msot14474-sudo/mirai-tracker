import { ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole, WorkingSaturdayRule } from '@prisma/client';
import { TimetableService } from './timetable.service';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';

const date = (s: string) => new Date(`${s}T00:00:00Z`);
const manager: AuthenticatedUser = {
  id: 'manager',
  name: 'Manager',
  email: 'manager@example.edu',
  roles: [{ role: UserRole.CAMPUS_MANAGER, campusId: 'campus-a' }],
  staffProfileId: null,
  studentProfile: null,
};
const input = {
  date: '2030-01-07',
  startTime: '14:00',
  endTime: '15:30',
  facultyAssignmentId: null,
  reason: 'Revision',
};
function setup() {
  const offering = {
    id: 'offering-a',
    batchId: 'batch-a',
    faculty: [
      {
        id: 'assignment-a',
        active: true,
        staffProfileId: 'staff-a',
        startDate: date('2030-01-01'),
        endDate: date('2030-03-31'),
      },
    ],
    timetableEntries: [],
    batch: {
      id: 'batch-a',
      semester: {
        campusId: 'campus-a',
        startDate: date('2030-01-01'),
        endDate: date('2030-03-31'),
        workingSaturdayRule: WorkingSaturdayRule.SECOND_AND_FOURTH,
        campus: { timezone: 'Asia/Kolkata' },
        calendarDays: [] as unknown[],
      },
    },
  };
  const tx = {
    subjectOffering: { findUnique: jest.fn().mockResolvedValue(offering) },
    timetableEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    scheduledSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'extra-a' }),
    },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn) => fn(tx)),
    lessonPlan: { findFirst: jest.fn().mockResolvedValue({ id: 'plan-a' }) },
  };
  const schedules = { calculate: jest.fn().mockResolvedValue({}) };
  const service = new TimetableService(
    prisma as never,
    new AccessPolicyService({} as never),
    schedules as never,
  );
  return { service, tx, prisma, schedules, offering };
}

it('adds one dated class in the campus timezone and recalculates the existing lesson plan', async () => {
  const { service, tx, schedules } = setup();
  const result = await service.createExtraClass('offering-a', input, manager);
  expect(result).toEqual({
    sessionId: 'extra-a',
    plannedMinutes: 90,
    warnings: [],
  });
  expect(tx.scheduledSession.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      offeringId: 'offering-a',
      timetableEntryId: null,
      facultyAssignmentId: null,
      isExtraSession: true,
      sessionDate: date(input.date),
      startsAt: new Date('2030-01-07T08:30:00Z'),
      endsAt: new Date('2030-01-07T10:00:00Z'),
    }),
  });
  expect(schedules.calculate).toHaveBeenCalledWith(
    'offering-a',
    { reason: 'MANUAL_RECALCULATION' },
    manager,
  );
  expect(tx.auditEvent.create).toHaveBeenCalled();
});
it('allows visiting-faculty hours before a teacher or lesson plan is assigned', async () => {
  const { service, offering, prisma, schedules } = setup();
  offering.faculty = [];
  prisma.lessonPlan.findFirst.mockResolvedValue(null);
  expect(
    await service.createExtraClass('offering-a', input, manager),
  ).toMatchObject({ plannedMinutes: 90 });
  expect(schedules.calculate).not.toHaveBeenCalled();
});
it('rejects a manager from another campus before writing a class', async () => {
  const { service, tx } = setup();
  await expect(
    service.createExtraClass('offering-a', input, {
      ...manager,
      roles: [{ role: UserRole.CAMPUS_MANAGER, campusId: 'campus-b' }],
    }),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.scheduledSession.create).not.toHaveBeenCalled();
});
it.each([
  [{ ...input, date: '2030-04-01' }, 'inside the semester'],
  [{ ...input, date: '2030-01-05' }, 'closed'],
  [{ ...input, endTime: '13:00' }, 'after start time'],
  [{ ...input, endTime: '23:00' }, 'eight hours'],
  [{ ...input, facultyAssignmentId: 'foreign' }, 'active faculty assignment'],
])('rejects invalid extra class details: %j', async (data, message) => {
  const { service, tx } = setup();
  await expect(
    service.createExtraClass('offering-a', data, manager),
  ).rejects.toThrow(message);
  expect(tx.scheduledSession.create).not.toHaveBeenCalled();
});
it('allows the second Saturday but respects a holiday override', async () => {
  const { service, offering, tx } = setup();
  await expect(
    service.createExtraClass(
      'offering-a',
      { ...input, date: '2030-01-12' },
      manager,
    ),
  ).resolves.toMatchObject({ plannedMinutes: 90 });
  tx.scheduledSession.create.mockClear();
  offering.batch.semester.calendarDays = [
    {
      date: date('2030-01-12'),
      type: 'HOLIDAY',
      title: 'Closed',
      teachingAllowed: false,
    },
  ];
  await expect(
    service.createExtraClass(
      'offering-a',
      { ...input, date: '2030-01-12' },
      manager,
    ),
  ).rejects.toThrow('closed');
  expect(tx.scheduledSession.create).not.toHaveBeenCalled();
});
it('blocks collisions with dated classes and inherited teachers', async () => {
  const { service, tx } = setup();
  tx.scheduledSession.findFirst.mockResolvedValue({ id: 'overlap' });
  await expect(
    service.createExtraClass('offering-a', input, manager),
  ).rejects.toThrow('overlaps');
  expect(
    tx.scheduledSession.findFirst.mock.calls[0]![0].where.OR,
  ).toContainEqual(
    expect.objectContaining({
      facultyAssignment: { staffProfileId: { in: ['staff-a'] } },
    }),
  );
  expect(tx.scheduledSession.create).not.toHaveBeenCalled();
});
it('reports a duplicate without adding the same class twice', async () => {
  const { service, tx } = setup();
  tx.scheduledSession.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError('Duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    }),
  );
  await expect(
    service.createExtraClass('offering-a', input, manager),
  ).rejects.toThrow('already exists');
});
it('reports saved classes honestly if recalculating the plan needs a retry', async () => {
  const { service, schedules } = setup();
  schedules.calculate.mockRejectedValue(new Error('Temporary database issue'));
  const result = await service.createExtraClass('offering-a', input, manager);
  expect(result.sessionId).toBe('extra-a');
  expect(result.warnings[0]).toContain('was saved');
});
