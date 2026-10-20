import { TopicScheduleService } from './topic-schedule.service';
import { CALENDAR_REVIEW_REASON } from './calendar-review';
import { ForbiddenException } from '@nestjs/common';
function setup() {
  const session: any = {
    id: 's',
    offeringId: 'o',
    facultyAssignmentId: null,
    status: 'CANCELLED',
    cancellationReason: CALENDAR_REVIEW_REASON,
    sessionDate: new Date('2030-01-04'),
    startsAt: new Date('2030-01-04T03:30:00Z'),
    endsAt: new Date('2030-01-04T04:30:00Z'),
    _count: { logs: 0 },
    offering: {
      batchId: 'b',
      subject: { name: 'Data Structures' },
      targetFinishDate: new Date('2030-02-01'),
      faculty: [
        {
          staffProfileId: 'staff',
          startDate: new Date('2030-01-01'),
          endDate: new Date('2030-03-31'),
        },
      ],
      lessonPlans: [],
      batch: {
        semester: {
          startDate: new Date('2030-01-01'),
          endDate: new Date('2030-03-31'),
          workingSaturdayRule: 'SECOND_AND_FOURTH',
          campus: { timezone: 'Asia/Kolkata' },
          calendarDays: [
            {
              id: 'holiday',
              date: new Date('2030-01-04'),
              type: 'HOLIDAY',
              title: 'Closed',
              teachingAllowed: false,
            },
          ],
          examWindows: [],
        },
      },
    },
  };
  const prisma = {
    scheduledSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      findMany: jest.fn().mockResolvedValue([
        {
          startsAt: new Date('2030-01-07T03:30:00Z'),
          endsAt: new Date('2030-01-07T04:30:00Z'),
        },
      ]),
    },
  };
  const access = {
    assertCanManageOffering: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new TopicScheduleService(prisma as never, access as never);
  const user = { staffProfileId: 'staff' } as never;
  return { session, prisma, access, svc, user };
}
const key = process.env.OLLAMA_API_KEY;
beforeEach(() => {
  delete process.env.OLLAMA_API_KEY;
});
afterEach(() => {
  if (key) process.env.OLLAMA_API_KEY = key;
});
it('checks holidays, first Saturday, Sunday and conflicting classes before suggesting', async () => {
  const x = setup();
  const result = await x.svc.recoveryOptions('s', x.user);
  expect(result.options[0]).toMatchObject({
    date: '2030-01-08',
    startTime: '09:00',
    endTime: '10:00',
  });
  expect(
    result.options.some((o) =>
      ['2030-01-04', '2030-01-05', '2030-01-06', '2030-01-07'].includes(o.date),
    ),
  ).toBe(false);
  expect(result.options.some((o) => o.date === '2030-01-12')).toBe(true); // working second Saturday
  expect(x.access.assertCanManageOffering).toHaveBeenCalledWith(x.user, 'o');
});
it('does not offer dates outside the visiting teacher assignment', async () => {
  const x = setup();
  x.session.offering.faculty[0].endDate = new Date('2030-01-07');
  expect((await x.svc.recoveryOptions('s', x.user)).options).toEqual([]);
});
it('rejects resolved reviews, logged classes and unauthorized faculty', async () => {
  const x = setup();
  x.session._count.logs = 1;
  await expect(x.svc.recoveryOptions('s', x.user)).rejects.toThrow('no longer');
  x.session._count.logs = 0;
  x.session.cancellationReason = 'Teacher accepted cancellation';
  await expect(x.svc.recoveryOptions('s', x.user)).rejects.toThrow('no longer');
  x.access.assertCanManageOffering.mockRejectedValue(new ForbiddenException());
  await expect(x.svc.recoveryOptions('s', x.user)).rejects.toThrow(
    ForbiddenException,
  );
});
it('blocks restoring a class onto a newly closed calendar date', async () => {
  const x = setup();
  x.session.cancellationReason = 'Originally cancelled';
  x.prisma.scheduledSession.findUnique.mockImplementation(async (args: any) =>
    args.where.sourceKey ? null : x.session,
  );
  Object.assign(x.prisma, {
    semester: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(x.session.offering.batch.semester),
    },
  });
  await expect(
    x.svc.setSessionCancellation('s', { cancelled: false }, x.user),
  ).rejects.toThrow('closed in the current semester');
});
