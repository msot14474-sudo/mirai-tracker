import { AlertType } from '@prisma/client';

const HOUR_MS = 60 * 60 * 1_000;

export function alertDueAt(
  type: AlertType,
  session: { sessionDate: Date; endsAt: Date; timezone: string },
) {
  return type === AlertType.FACULTY_MISSED_LOG
    ? endOfCampusDay(session.sessionDate, session.timezone)
    : new Date(session.endsAt.getTime() + 48 * HOUR_MS);
}

export function isAlertDue(
  type: AlertType,
  session: { sessionDate: Date; endsAt: Date; timezone: string },
  now: Date,
) {
  return now.getTime() >= alertDueAt(type, session).getTime();
}

export function endOfCampusDay(sessionDate: Date, timezone: string) {
  const dateText = sessionDate.toISOString().slice(0, 10);
  const year = Number(dateText.slice(0, 4));
  const month = Number(dateText.slice(5, 7));
  const day = Number(dateText.slice(8, 10));
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const midnight = zonedDateTimeToUtc(
    {
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  );
  return new Date(midnight.getTime() - 1);
}

function zonedDateTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  },
  timezone: string,
) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = target - timezoneOffset(new Date(candidate), timezone);
  }
  return new Date(candidate);
}

function timezoneOffset(instant: Date, timezone: string) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((part) => part.type === type)?.value);
  const localAsUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return localAsUtc - Math.floor(instant.getTime() / 1_000) * 1_000;
}
