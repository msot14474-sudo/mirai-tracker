import { calculateRemainingSchedule } from './topic-schedule.engine';
import { TopicScheduleService } from './topic-schedule.service';
const topic = {
  id: 'topic',
  unitSequence: 1,
  topicSequence: 1,
  unitTitle: 'Unit',
  title: 'Forms',
  requiredMinutes: 120,
  completionPercentage: 50,
};
const slot = (
  id: string,
  date: string,
  status = 'SCHEDULED',
  hasLogs = false,
) => ({
  id,
  sessionDate: date,
  startsAt: new Date(date + 'T09:00:00Z'),
  endsAt: new Date(date + 'T10:00:00Z'),
  status,
  hasLogs,
});
it('carries only unfinished hours into future unlogged classes', () => {
  const result = calculateRemainingSchedule(
    [topic],
    [
      slot('old', '2030-01-01'),
      slot('logged', '2030-01-07', 'COMPLETED', true),
      slot('cancelled', '2030-01-08', 'CANCELLED'),
      slot('next', '2030-01-09'),
    ],
    new Date('2030-01-05'),
  );
  expect(result.allocations[0]?.sessionIds).toEqual(['next']);
  expect(result.summary.requiredMinutes).toBe(60);
  expect(topic.requiredMinutes).toBe(120);
});
it('reports shortfall rather than squeezing work into insufficient hours', () => {
  const result = calculateRemainingSchedule(
    [{ ...topic, completionPercentage: 0 }],
    [slot('next', '2030-01-09')],
    new Date('2030-01-05'),
  );
  expect(result.summary.shortfallMinutes).toBe(60);
});
it('excludes completed and skipped topics', () => {
  expect(
    calculateRemainingSchedule(
      [
        { ...topic, completionPercentage: 100 },
        { ...topic, id: 'skip', skipped: true },
      ],
      [],
      new Date(),
    ).summary.requiredMinutes,
  ).toBe(0);
});
function setup() {
  const session = {
    id: 'session',
    status: 'SCHEDULED',
    offeringId: 'offering',
    facultyAssignmentId: 'assignment',
    startsAt: new Date('2030-01-01'),
    endsAt: new Date('2030-01-01T01:00:00Z'),
    _count: { logs: 0 },
    offering: {
      batchId: 'batch',
      faculty: [
        {
          staffProfileId: 'staff',
          startDate: new Date('2029-01-01'),
          endDate: null,
        },
      ],
      batch: {
        semester: {
          campusId: 'campus',
          startDate: new Date('2030-01-01'),
          endDate: new Date('2030-03-31'),
          workingSaturdayRule: 'SECOND_AND_FOURTH',
          calendarDays: [],
          campus: { timezone: 'Asia/Kolkata' },
        },
      },
    },
  };
  const tx = {
    scheduledSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'replacement' }),
    },
    auditEvent: { create: jest.fn() },
  };
  const db = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    lessonPlan: { findFirst: jest.fn().mockResolvedValue({ id: 'plan' }) },
  };
  const access = {
    assertCanManageOffering: jest.fn().mockResolvedValue(undefined),
    canManageCampus: jest.fn().mockReturnValue(false),
  };
  const service = new TopicScheduleService(db as any, access as any);
  const calculate = jest
    .spyOn(service, 'calculate')
    .mockResolvedValue({} as any);
  const user = {
    id: 'teacher',
    roles: [{ role: 'FACULTY', campusId: 'campus' }],
    staffProfileId: 'staff',
  } as any;
  return { session, tx, access, service, user, calculate };
}
const move = {
  date: '2030-01-07',
  startTime: '09:00',
  endTime: '10:00',
  reason: 'Recovery class',
};
it('moves an assigned class and preserves its original history', async () => {
  const x = setup();
  await expect(x.service.moveSession('session', move, x.user)).resolves.toEqual(
    { offeringId: 'offering', sessionId: 'replacement' },
  );
  expect(x.calculate).toHaveBeenCalledWith(
    'offering',
    { reason: 'MANUAL_RECALCULATION' },
    x.user,
  );
  expect(x.tx.scheduledSession.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }),
  );
  expect(x.tx.scheduledSession.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        isExtraSession: true,
        sourceKey: 'move:session',
      }),
    }),
  );
});
it('rejects a batch/teacher collision', async () => {
  const x = setup();
  x.tx.scheduledSession.findFirst.mockResolvedValue({ id: 'conflict' } as any);
  await expect(x.service.moveSession('session', move, x.user)).rejects.toThrow(
    'overlaps',
  );
  expect(x.tx.scheduledSession.create).not.toHaveBeenCalled();
});
it('rejects a non-working first Saturday', async () => {
  const x = setup();
  await expect(
    x.service.moveSession('session', { ...move, date: '2030-01-05' }, x.user),
  ).rejects.toThrow('not a teaching day');
});
it('rejects another teachers subject', async () => {
  const x = setup();
  x.access.assertCanManageOffering.mockRejectedValue(new Error('Not assigned'));
  await expect(x.service.moveSession('session', move, x.user)).rejects.toThrow(
    'Not assigned',
  );
  expect(x.tx.scheduledSession.create).not.toHaveBeenCalled();
});
it('protects logged sessions', async () => {
  const x = setup();
  x.session._count.logs = 1;
  await expect(x.service.moveSession('session', move, x.user)).rejects.toThrow(
    'unlogged',
  );
});

it('moves a calendar-affected class only through an explicit teacher decision', async () => {
  const x = setup();
  x.session.status = 'CANCELLED';
  Object.assign(x.session, {
    cancellationReason: 'Calendar changed — teacher review required.',
  });
  await expect(
    x.service.moveSession('session', move, x.user),
  ).resolves.toMatchObject({ sessionId: 'replacement' });
  expect(x.calculate).toHaveBeenCalled();
});
it('does not move an already resolved cancellation or a logged calendar review', async () => {
  const x = setup();
  x.session.status = 'CANCELLED';
  Object.assign(x.session, {
    cancellationReason: 'Teacher reviewed calendar change',
  });
  await expect(x.service.moveSession('session', move, x.user)).rejects.toThrow(
    'Only an unlogged',
  );
  Object.assign(x.session, {
    cancellationReason: 'Calendar changed — teacher review required.',
  });
  x.session._count.logs = 1;
  await expect(x.service.moveSession('session', move, x.user)).rejects.toThrow(
    'Only an unlogged',
  );
  expect(x.tx.scheduledSession.create).not.toHaveBeenCalled();
});
