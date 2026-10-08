import { CalendarDayType, WorkingSaturdayRule } from '@prisma/client';
import { buildAcademicCalendar, evaluateCalendarDay } from './calendar-engine';

const threeMonths = (rule: WorkingSaturdayRule) =>
  buildAcademicCalendar({
    semesterStart: '2026-01-01',
    semesterEnd: '2026-03-31',
    saturdayRule: rule,
  });

describe('academic calendar engine', () => {
  it('disables every Saturday when the rule is NONE', () => {
    const saturdays = threeMonths(WorkingSaturdayRule.NONE).days.filter(
      (day) => day.weekday === 'SATURDAY',
    );
    expect(saturdays).toHaveLength(13);
    expect(saturdays.every((day) => !day.working)).toBe(true);
  });

  it('enables every Saturday when the rule is ALL', () => {
    const saturdays = threeMonths(WorkingSaturdayRule.ALL).days.filter(
      (day) => day.weekday === 'SATURDAY',
    );
    expect(saturdays).toHaveLength(13);
    expect(saturdays.every((day) => day.working)).toBe(true);
  });

  it('selects exactly the second and fourth Saturdays across three months', () => {
    const workingSaturdays = threeMonths(WorkingSaturdayRule.SECOND_AND_FOURTH)
      .days.filter((day) => day.weekday === 'SATURDAY' && day.working)
      .map((day) => day.date);

    expect(workingSaturdays).toEqual([
      '2026-01-10',
      '2026-01-24',
      '2026-02-14',
      '2026-02-28',
      '2026-03-14',
      '2026-03-28',
    ]);
  });

  it('keeps a fifth Saturday non-working under the second/fourth rule', () => {
    expect(
      evaluateCalendarDay('2026-01-31', WorkingSaturdayRule.SECOND_AND_FOURTH),
    ).toMatchObject({ working: false, reason: 'NON_WORKING_SATURDAY' });
  });

  it('lets a holiday override a normal weekday', () => {
    expect(
      evaluateCalendarDay('2026-01-05', WorkingSaturdayRule.ALL, {
        date: '2026-01-05',
        type: CalendarDayType.HOLIDAY,
        title: 'Campus holiday',
        teachingAllowed: true,
      }),
    ).toMatchObject({ working: false, reason: CalendarDayType.HOLIDAY });
  });

  it('lets an extra working day enable a Sunday', () => {
    expect(
      evaluateCalendarDay('2026-01-04', WorkingSaturdayRule.NONE, {
        date: '2026-01-04',
        type: CalendarDayType.EXTRA_WORKING_DAY,
        title: 'Recovery class',
        teachingAllowed: false,
      }),
    ).toMatchObject({
      working: true,
      reason: CalendarDayType.EXTRA_WORKING_DAY,
    });
  });

  it('honours the teaching flag for academic events', () => {
    const event = {
      date: '2026-01-06',
      type: CalendarDayType.EVENT,
      title: 'Campus event',
      teachingAllowed: false,
    };
    expect(
      evaluateCalendarDay(event.date, WorkingSaturdayRule.ALL, event).working,
    ).toBe(false);
    expect(
      evaluateCalendarDay(event.date, WorkingSaturdayRule.ALL, {
        ...event,
        teachingAllowed: true,
      }).working,
    ).toBe(true);
  });

  it('rejects generated ranges outside the semester', () => {
    expect(() =>
      buildAcademicCalendar({
        semesterStart: '2026-01-01',
        semesterEnd: '2026-03-31',
        from: '2025-12-31',
        saturdayRule: WorkingSaturdayRule.NONE,
      }),
    ).toThrow('inside the semester');
  });
});
