import { LessonPlanStatus, PrismaClient } from '@prisma/client';
import {
  evaluateDemoReadiness,
  type DemoSummary,
} from '../src/deployment/demo-readiness';

const prisma = new PrismaClient();

async function loadSummary(): Promise<DemoSummary> {
  const campus = await prisma.campus.findUnique({ where: { code: 'HI-TECH' } });
  if (!campus) return emptySummary();

  const semester = await prisma.semester.findFirst({
    where: { campusId: campus.id, name: 'Sample Semester 2026' },
  });
  if (!semester) return { ...emptySummary(), campuses: 1 };

  const whereSemester = { semesterId: semester.id };
  const [
    batches,
    calendarOverrides,
    examWindows,
    subjectOfferings,
    timetableEntries,
    scheduledSessions,
    lessonPlans,
    topics,
    demoUsers,
  ] = await Promise.all([
    prisma.batch.count({ where: whereSemester }),
    prisma.calendarDayOverride.count({ where: whereSemester }),
    prisma.examWindow.count({ where: whereSemester }),
    prisma.subjectOffering.count({ where: { batch: whereSemester } }),
    prisma.timetableEntry.count({
      where: { offering: { batch: whereSemester }, active: true },
    }),
    prisma.scheduledSession.count({
      where: { offering: { batch: whereSemester } },
    }),
    prisma.lessonPlan.count({
      where: {
        offering: { batch: whereSemester },
        status: LessonPlanStatus.ACTIVE,
      },
    }),
    prisma.topic.count({
      where: { unit: { lessonPlan: { offering: { batch: whereSemester } } } },
    }),
    prisma.user.count({
      where: {
        email: {
          in: [
            'admin@mirai.local',
            'campus.manager@mirai.local',
            'faculty@mirai.local',
            'student@mirai.local',
          ],
        },
        passwordCredential: { isNot: null },
      },
    }),
  ]);

  return {
    campuses: 1,
    semesters: 1,
    semesterDays:
      Math.round(
        (semester.endDate.getTime() - semester.startDate.getTime()) /
          86_400_000,
      ) + 1,
    batches,
    calendarOverrides,
    examWindows,
    subjectOfferings,
    timetableEntries,
    scheduledSessions,
    lessonPlans,
    topics,
    demoUsers,
  };
}

function emptySummary(): DemoSummary {
  return {
    campuses: 0,
    semesters: 0,
    semesterDays: 0,
    batches: 0,
    calendarOverrides: 0,
    examWindows: 0,
    subjectOfferings: 0,
    timetableEntries: 0,
    scheduledSessions: 0,
    lessonPlans: 0,
    topics: 0,
    demoUsers: 0,
  };
}

loadSummary()
  .then((summary) => {
    const result = evaluateDemoReadiness(summary);
    console.info(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
