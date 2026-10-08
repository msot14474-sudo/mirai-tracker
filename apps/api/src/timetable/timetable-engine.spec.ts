import { CalendarDayType, WorkingSaturdayRule } from '@prisma/client';
import {
  buildTimetableSessions,
  durationMinutes,
  timetableTime,
  zonedDateTimeToUtc,
} from './timetable-engine';

const base = {
  offeringId: 'offering-a',
  timezone: 'Asia/Kolkata',
  semesterStart: '2026-01-01',
  semesterEnd: '2026-03-31',
  saturdayRule: WorkingSaturdayRule.SECOND_AND_FOURTH,
  overrides: [],
};

describe('timetable engine', () => {
  it('derives planned minutes from start and end times', () => {
    expect(durationMinutes('09:15', '10:45')).toBe(90);
    expect(timetableTime('09:15').toISOString()).toBe(
      '1970-01-01T09:15:00.000Z',
    );
  });

  it('rejects reversed and excessively long timetable slots', () => {
    expect(() => durationMinutes('11:00', '10:00')).toThrow(
      'End time must be after start time',
    );
    expect(() => durationMinutes('08:00', '17:00')).toThrow('eight hours');
  });

  it('generates one dated session for every working Monday', () => {
    const sessions = buildTimetableSessions({
      ...base,
      entries: [entry({ weekday: 1 })],
    });
    expect(sessions).toHaveLength(13);
    expect(sessions[0]).toMatchObject({
      sessionDate: '2026-01-05',
      plannedMinutes: 60,
      sourceKey: 'timetable:entry-a:2026-01-05',
    });
  });

  it('skips a holiday and includes an extra working Sunday', () => {
    const overrides = [
      {
        date: '2026-01-05',
        type: CalendarDayType.HOLIDAY,
        title: 'Closed Monday',
        teachingAllowed: false,
      },
      {
        date: '2026-01-04',
        type: CalendarDayType.EXTRA_WORKING_DAY,
        title: 'Recovery Sunday',
        teachingAllowed: true,
      },
    ];
    const sessions = buildTimetableSessions({
      ...base,
      overrides,
      entries: [entry({ weekday: 1 }), entry({ id: 'entry-sun', weekday: 7 })],
    });
    expect(
      sessions.some((session) => session.sessionDate === '2026-01-05'),
    ).toBe(false);
    expect(
      sessions.some((session) => session.sessionDate === '2026-01-04'),
    ).toBe(true);
  });

  it('generates only second and fourth Saturday sessions across three months', () => {
    const sessions = buildTimetableSessions({
      ...base,
      entries: [entry({ weekday: 6 })],
    });
    expect(sessions.map((session) => session.sessionDate)).toEqual([
      '2026-01-10',
      '2026-01-24',
      '2026-02-14',
      '2026-02-28',
      '2026-03-14',
      '2026-03-28',
    ]);
  });

  it('honours an entry effective range inside the semester', () => {
    const sessions = buildTimetableSessions({
      ...base,
      entries: [
        entry({ effectiveFrom: '2026-02-01', effectiveTo: '2026-02-28' }),
      ],
    });
    expect(sessions.map((session) => session.sessionDate)).toEqual([
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
    ]);
  });

  it('stores campus-local session times as correct UTC instants', () => {
    expect(
      zonedDateTimeToUtc('2026-01-05', '09:00', 'Asia/Kolkata').toISOString(),
    ).toBe('2026-01-05T03:30:00.000Z');
    expect(() =>
      zonedDateTimeToUtc('2026-03-08', '02:30', 'America/New_York'),
    ).toThrow('does not exist');
  });
});

function entry(overrides: Partial<ReturnType<typeof entryBase>> = {}) {
  return { ...entryBase(), ...overrides };
}

function entryBase() {
  return {
    id: 'entry-a',
    weekday: 1,
    startTime: '09:00',
    endTime: '10:00',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-03-31',
    facultyAssignmentId: null,
  };
}
