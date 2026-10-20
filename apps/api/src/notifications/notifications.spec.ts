import { completedWeek, weeklyAccessKey } from './weekly-summary.service';
import { ActivityService, changeFor } from './activity.service';
it('schedules the completed local week after Monday morning, including timezone boundaries', () => {
  expect(
    completedWeek(new Date('2026-10-19T02:59:00Z'), 'Asia/Kolkata'),
  ).toBeNull();
  const week = completedWeek(new Date('2026-10-19T03:00:00Z'), 'Asia/Kolkata')!;
  expect(week.start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
  expect(week.end.toISOString()).toBe('2026-10-18T00:00:00.000Z');
  expect(
    completedWeek(new Date('2026-10-20T03:00:00Z'), 'Asia/Kolkata'),
  ).toEqual(week);
});
it('never creates change notices for previews, reads, authentication or chat requests', () => {
  for (const path of [
    '/imports/preview',
    '/imports/calendar/id/verify',
    '/timetable/batches/id/preview',
    '/ai-insights/report',
    '/auth/login',
    '/notifications/read',
  ])
    expect(changeFor('POST', path)).toBeNull();
  expect(changeFor('GET', '/timetable/offerings')).toBeNull();
  expect(changeFor('POST', '/timetable/batches/id/import')?.title).toBe(
    'Batch timetable uploaded',
  );
  expect(changeFor('POST', '/faculty-access/campuses/id/faculty')?.title).toBe(
    'Faculty added',
  );
});
it('invalidates stored summaries when a person changes roles or campus', () => {
  const user: any = {
    staffProfileId: 'staff',
    roles: [{ role: 'FACULTY', campusId: 'a' }],
  };
  expect(weeklyAccessKey(user)).not.toBe(
    weeklyAccessKey({ ...user, roles: [{ role: 'FACULTY', campusId: 'b' }] }),
  );
});

it('resolves calendar changes from stored ownership instead of unrelated request fields', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const semesterId = '22222222-2222-4222-8222-222222222222';
  const campusId = '33333333-3333-4333-8333-333333333333';
  const db: any = {
    calendarDayOverride: {
      findUnique: jest.fn().mockResolvedValue({ semesterId, title: 'Holiday' }),
    },
    semester: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: semesterId, campusId, name: 'Semester' }),
    },
  };
  const activity = new ActivityService(db);
  expect(
    await activity.resolve(
      { calendarDayId: id },
      { campusId: id, semesterId: id },
    ),
  ).toMatchObject({ campusId, semesterId, name: 'Holiday' });
  await expect(
    activity.publish(
      { roles: [{ role: 'CAMPUS_MANAGER', campusId: id }] } as any,
      { title: 'Changed', category: 'Teaching', view: 'timetable' },
      { campusId, offeringIds: [] },
    ),
  ).rejects.toThrow('campus');
});
