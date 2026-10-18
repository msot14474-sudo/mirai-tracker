import {
  CalendarFileService,
  calendarEntrySchema,
  validateCalendarEntries,
} from './calendar-file.service';
import { createHash } from 'node:crypto';
const entry = (changes = {}) =>
  calendarEntrySchema.parse({
    title: 'Holiday',
    start: '2026-10-02',
    end: '2026-10-02',
    kind: 'HOLIDAY',
    teachingAllowed: false,
    ...changes,
  });
const user = { id: 'user' } as any;
describe('Calendar file import protections', () => {
  it('rejects impossible and ambiguous dates', () => {
    expect(() => entry({ start: '2026-02-30' })).toThrow();
    expect(() => entry({ start: '02/10/26' })).toThrow();
  });
  it('allows partial and unordered date lists without filling gaps', () => {
    expect(() =>
      validateCalendarEntries(
        [entry(), entry({ start: '2026-09-01', end: '2026-09-01' })],
        '2026-07-01',
        '2026-12-31',
      ),
    ).not.toThrow();
  });
  it('rejects dates outside the semester, reversed ranges, duplicate dates and missing exam deadlines', () => {
    for (const entries of [
      [entry({ start: '2027-01-01', end: '2027-01-01' })],
      [entry({ start: '2026-10-03' })],
      [entry(), entry()],
      [entry({ kind: 'EXAM' })],
    ]) {
      expect(() =>
        validateCalendarEntries(entries, '2026-07-01', '2026-12-31'),
      ).toThrow();
    }
  });
  function fixture(verified = true) {
    const semester = {
      id: 'semester',
      campusId: 'campus',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      calendarDays: [],
      examWindows: [],
    };
    const draft = {
      semesterId: 'semester',
      fingerprint: createHash('sha256')
        .update(JSON.stringify(semester))
        .digest('hex'),
      entries: [entry()],
      verified,
      fileName: 'calendar.csv',
    };
    const db: any = {
      semester: { findUnique: jest.fn().mockResolvedValue(semester) },
      importJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      calendarDayOverride: { upsert: jest.fn() },
      auditEvent: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    const timetable = { regenerateSemester: jest.fn().mockResolvedValue({}) };
    const service = new CalendarFileService(
      db,
      { assertGlobalManager: jest.fn() } as any,
      { get: jest.fn().mockResolvedValue(JSON.stringify(draft)) } as any,
      timetable as any,
    );
    return { db, service, timetable };
  }
  it('requires verification and review before any writes', async () => {
    const { service, db } = fixture(false);
    await expect(
      service.commit('token', { reviewed: true, entries: [entry()] }, user),
    ).rejects.toThrow('second verification');
    expect(db.$transaction).not.toHaveBeenCalled();
    await expect(
      fixture().service.commit(
        'token',
        { reviewed: false, entries: [entry()] },
        user,
      ),
    ).rejects.toThrow();
  });
  it('updates only explicit dates and never rewrites the semester or clears unlisted dates', async () => {
    const { service, db, timetable } = fixture();
    await service.commit('token', { reviewed: true, entries: [entry()] }, user);
    expect(db.calendarDayOverride.upsert).toHaveBeenCalledTimes(1);
    expect(
      db.calendarDayOverride.upsert.mock.calls[0][0].where.semesterId_date.date.toISOString(),
    ).toBe('2026-10-02T00:00:00.000Z');
    expect(timetable.regenerateSemester).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate a committed import on retry', async () => {
    const { service, db } = fixture();
    db.importJob.findUnique.mockResolvedValue({ id: 'token' });
    await service.commit('token', { reviewed: true, entries: [entry()] }, user);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects stale previews before writing dates', async () => {
    const { service, db } = fixture();
    db.semester.findUnique
      .mockResolvedValueOnce({
        id: 'semester',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
      })
      .mockResolvedValueOnce({ changed: true });
    await expect(
      service.commit('token', { reviewed: true, entries: [entry()] }, user),
    ).rejects.toThrow('changed since');
    expect(db.calendarDayOverride.upsert).not.toHaveBeenCalled();
  });
});
