import { CalendarDayType, WorkingSaturdayRule } from '@prisma/client';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const weekdayNames = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export type CalendarOverride = {
  id?: string;
  date: string;
  type: CalendarDayType;
  title: string;
  teachingAllowed: boolean;
  notes?: string | null;
};

export type CalendarDay = {
  date: string;
  weekday: (typeof weekdayNames)[number];
  working: boolean;
  reason:
    | 'WEEKDAY'
    | 'SUNDAY'
    | 'SATURDAY_DISABLED'
    | 'ALL_SATURDAYS'
    | 'SECOND_SATURDAY'
    | 'FOURTH_SATURDAY'
    | 'NON_WORKING_SATURDAY'
    | CalendarDayType;
  override: CalendarOverride | null;
};

export function parseIsoDate(value: string) {
  if (!isoDatePattern.test(value)) throw new RangeError('Use YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (formatIsoDate(date) !== value) throw new RangeError('Date is invalid.');
  return date;
}

export function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addUtcDay(value: Date) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function evaluateOverride(override: CalendarOverride): CalendarDay['working'] {
  if (override.type === CalendarDayType.EXTRA_WORKING_DAY) return true;
  if (
    override.type === CalendarDayType.HOLIDAY ||
    override.type === CalendarDayType.CAMPUS_CLOSED
  ) {
    return false;
  }
  return override.teachingAllowed;
}

export function evaluateCalendarDay(
  dateText: string,
  saturdayRule: WorkingSaturdayRule,
  override: CalendarOverride | null = null,
): CalendarDay {
  const date = parseIsoDate(dateText);
  const weekdayIndex = date.getUTCDay();

  if (override) {
    return {
      date: dateText,
      weekday: weekdayNames[weekdayIndex]!,
      working: evaluateOverride(override),
      reason: override.type,
      override,
    };
  }

  if (weekdayIndex === 0) {
    return {
      date: dateText,
      weekday: 'SUNDAY',
      working: false,
      reason: 'SUNDAY',
      override: null,
    };
  }

  if (weekdayIndex !== 6) {
    return {
      date: dateText,
      weekday: weekdayNames[weekdayIndex]!,
      working: true,
      reason: 'WEEKDAY',
      override: null,
    };
  }

  if (saturdayRule === WorkingSaturdayRule.ALL) {
    return {
      date: dateText,
      weekday: 'SATURDAY',
      working: true,
      reason: 'ALL_SATURDAYS',
      override: null,
    };
  }

  if (saturdayRule === WorkingSaturdayRule.NONE) {
    return {
      date: dateText,
      weekday: 'SATURDAY',
      working: false,
      reason: 'SATURDAY_DISABLED',
      override: null,
    };
  }

  const occurrence = Math.ceil(date.getUTCDate() / 7);
  const working = occurrence === 2 || occurrence === 4;
  return {
    date: dateText,
    weekday: 'SATURDAY',
    working,
    reason:
      occurrence === 2
        ? 'SECOND_SATURDAY'
        : occurrence === 4
          ? 'FOURTH_SATURDAY'
          : 'NON_WORKING_SATURDAY',
    override: null,
  };
}

export function buildAcademicCalendar(input: {
  semesterStart: string;
  semesterEnd: string;
  from?: string;
  to?: string;
  saturdayRule: WorkingSaturdayRule;
  overrides?: CalendarOverride[];
}) {
  const semesterStart = parseIsoDate(input.semesterStart);
  const semesterEnd = parseIsoDate(input.semesterEnd);
  const from = parseIsoDate(input.from ?? input.semesterStart);
  const to = parseIsoDate(input.to ?? input.semesterEnd);

  if (semesterEnd < semesterStart) {
    throw new RangeError(
      'Semester end date must be on or after its start date.',
    );
  }
  if (from < semesterStart || to > semesterEnd || to < from) {
    throw new RangeError('Calendar range must be inside the semester.');
  }

  const overrides = new Map(
    (input.overrides ?? []).map((override) => [override.date, override]),
  );
  const days: CalendarDay[] = [];
  let cursor = from;

  while (cursor <= to) {
    if (days.length >= 550) {
      throw new RangeError('Calendar range cannot exceed 550 days.');
    }
    const date = formatIsoDate(cursor);
    days.push(
      evaluateCalendarDay(
        date,
        input.saturdayRule,
        overrides.get(date) ?? null,
      ),
    );
    cursor = addUtcDay(cursor);
  }

  return {
    days,
    summary: {
      totalDays: days.length,
      workingDays: days.filter((day) => day.working).length,
      nonWorkingDays: days.filter((day) => !day.working).length,
    },
  };
}
