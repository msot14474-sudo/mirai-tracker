import { WorkingSaturdayRule } from '@prisma/client';
import {
  CalendarOverride,
  buildAcademicCalendar,
  formatIsoDate,
  parseIsoDate,
} from '../academic-calendar/calendar-engine';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type WeeklyTimetableEntry = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
  facultyAssignmentId: string | null;
};

export type PlannedSession = {
  sourceKey: string;
  timetableEntryId: string;
  facultyAssignmentId: string | null;
  sessionDate: string;
  startsAt: Date;
  endsAt: Date;
  plannedMinutes: number;
};

export function parseTime(value: string) {
  if (!timePattern.test(value)) {
    throw new RangeError('Use a valid 24-hour time in HH:mm format.');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return { hours: hours!, minutes: minutes! };
}

export function timetableTime(value: string) {
  parseTime(value);
  return new Date(`1970-01-01T${value}:00.000Z`);
}

export function formatTimetableTime(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
}

export function durationMinutes(startTime: string, endTime: string) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const minutes =
    end.hours * 60 + end.minutes - (start.hours * 60 + start.minutes);
  if (minutes <= 0) throw new RangeError('End time must be after start time.');
  if (minutes > 8 * 60) {
    throw new RangeError('A timetable slot cannot exceed eight hours.');
  }
  return minutes;
}

export function isoWeekday(date: string) {
  const weekday = parseIsoDate(date).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function buildTimetableSessions(input: {
  offeringId: string;
  timezone: string;
  semesterStart: string;
  semesterEnd: string;
  saturdayRule: WorkingSaturdayRule;
  overrides?: CalendarOverride[];
  entries: WeeklyTimetableEntry[];
}): PlannedSession[] {
  assertTimezone(input.timezone);
  const calendar = buildAcademicCalendar({
    semesterStart: input.semesterStart,
    semesterEnd: input.semesterEnd,
    saturdayRule: input.saturdayRule,
    overrides: input.overrides,
  });
  const sessions: PlannedSession[] = [];

  for (const entry of input.entries) {
    const plannedMinutes = durationMinutes(entry.startTime, entry.endTime);
    if (entry.weekday < 1 || entry.weekday > 7) {
      throw new RangeError('Weekday must be between 1 and 7.');
    }
    const from = parseIsoDate(entry.effectiveFrom);
    const to = parseIsoDate(entry.effectiveTo);
    if (to < from) {
      throw new RangeError(
        'Effective end date must be on or after its start date.',
      );
    }

    for (const day of calendar.days) {
      if (!day.working || isoWeekday(day.date) !== entry.weekday) continue;
      const date = parseIsoDate(day.date);
      if (date < from || date > to) continue;
      sessions.push({
        sourceKey: `timetable:${entry.id}:${day.date}`,
        timetableEntryId: entry.id,
        facultyAssignmentId: entry.facultyAssignmentId,
        sessionDate: day.date,
        startsAt: zonedDateTimeToUtc(day.date, entry.startTime, input.timezone),
        endsAt: zonedDateTimeToUtc(day.date, entry.endTime, input.timezone),
        plannedMinutes,
      });
    }
  }

  return sessions.sort(
    (left, right) =>
      left.startsAt.getTime() - right.startsAt.getTime() ||
      left.sourceKey.localeCompare(right.sourceKey),
  );
}

export function zonedDateTimeToUtc(
  dateText: string,
  timeText: string,
  timezone: string,
) {
  const date = parseIsoDate(dateText);
  const time = parseTime(timeText);
  const localAsUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    time.hours,
    time.minutes,
  );
  let result = localAsUtc - timezoneOffsetMs(new Date(localAsUtc), timezone);
  result = localAsUtc - timezoneOffsetMs(new Date(result), timezone);
  const utc = new Date(result);

  const parts = zonedParts(utc, timezone);
  if (
    `${parts.year}-${parts.month}-${parts.day}` !== dateText ||
    `${parts.hour}:${parts.minute}` !== timeText
  ) {
    throw new RangeError(
      `The local time ${dateText} ${timeText} does not exist in ${timezone}.`,
    );
  }
  return utc;
}

function timezoneOffsetMs(value: Date, timezone: string) {
  const parts = zonedParts(value, timezone);
  const represented = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return represented - value.getTime();
}

function zonedParts(value: Date, timezone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

function assertTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(
      parseIsoDate(formatIsoDate(new Date())),
    );
  } catch {
    throw new RangeError(`Unknown campus timezone: ${timezone}.`);
  }
}
