export type DemoSummary = {
  campuses: number;
  semesters: number;
  semesterDays: number;
  batches: number;
  calendarOverrides: number;
  examWindows: number;
  subjectOfferings: number;
  timetableEntries: number;
  scheduledSessions: number;
  lessonPlans: number;
  topics: number;
  demoUsers: number;
};

export function evaluateDemoReadiness(summary: DemoSummary) {
  const checks = [
    check('One demonstration campus exists', summary.campuses === 1),
    check('One full semester exists', summary.semesters === 1),
    check('Semester covers at least 120 days', summary.semesterDays >= 120),
    check('One demonstration batch exists', summary.batches === 1),
    check(
      'Calendar has at least four dated overrides',
      summary.calendarOverrides >= 4,
    ),
    check('Mid-term and end-term windows exist', summary.examWindows >= 2),
    check(
      'At least one subject offering exists',
      summary.subjectOfferings >= 1,
    ),
    check('A recurring weekly timetable exists', summary.timetableEntries >= 2),
    check(
      'Timetable generated at least 20 dated sessions',
      summary.scheduledSessions >= 20,
    ),
    check(
      'A lesson plan with at least eight topics exists',
      summary.lessonPlans >= 1 && summary.topics >= 8,
    ),
    check('All four demonstration roles can sign in', summary.demoUsers >= 4),
  ];

  return {
    passed: checks.every((item) => item.passed),
    summary,
    checks,
  };
}

function check(name: string, passed: boolean) {
  return { name, passed };
}
