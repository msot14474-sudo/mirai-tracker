import { evaluateDemoReadiness, type DemoSummary } from './demo-readiness';

const ready: DemoSummary = {
  campuses: 1,
  semesters: 1,
  semesterDays: 168,
  batches: 1,
  calendarOverrides: 4,
  examWindows: 2,
  subjectOfferings: 1,
  timetableEntries: 2,
  scheduledSessions: 45,
  lessonPlans: 1,
  topics: 8,
  demoUsers: 4,
};

describe('evaluateDemoReadiness', () => {
  it('accepts the complete M18 demonstration dataset', () => {
    expect(evaluateDemoReadiness(ready)).toMatchObject({ passed: true });
  });

  it('identifies an incomplete calendar and timetable', () => {
    const result = evaluateDemoReadiness({
      ...ready,
      calendarOverrides: 0,
      scheduledSessions: 3,
    });

    expect(result.passed).toBe(false);
    expect(
      result.checks.filter((item) => !item.passed).map((item) => item.name),
    ).toEqual([
      'Calendar has at least four dated overrides',
      'Timetable generated at least 20 dated sessions',
    ]);
  });
});
