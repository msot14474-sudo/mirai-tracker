/** Adds truthful, explicitly labelled demonstration notifications and summary previews. */
import { PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { weeklyAccessKey } from '../src/notifications/weekly-summary.service';
const db = new PrismaClient();
async function main() {
  const manifest = JSON.parse(
    await readFile(process.env.EVALUATOR_PRIVATE_OUTPUT!, 'utf8'),
  );
  const administrator = await db.user.findFirstOrThrow({
    where: { status: 'ACTIVE', roleAssignments: { some: { role: 'ADMIN' } } },
    include: { roleAssignments: true, staffProfile: true },
  });
  for (const campus of manifest.campuses) {
    const existing = await db.auditEvent.findFirst({
      where: {
        entityType: 'EvaluatorDemoEnriched',
        entityId: campus.semesterId,
      },
    });
    if (existing) continue;
    const offerings = await db.subjectOffering.findMany({
      where: { batch: { semesterId: campus.semesterId } },
      include: {
        subject: true,
        faculty: {
          include: {
            staffProfile: {
              include: { user: { include: { roleAssignments: true } } },
            },
          },
        },
        lessonPlans: {
          where: { status: 'ACTIVE' },
          include: { units: { include: { topics: true } } },
        },
        sessions: {
          include: { logs: { orderBy: { revision: 'desc' }, take: 1 } },
        },
      },
    });
    const facultyIds = [
      ...new Set(
        offerings.flatMap((o) => o.faculty.map((f) => f.staffProfile.userId)),
      ),
    ];
    const manager = await db.user.findUniqueOrThrow({
      where: { id: campus.managerId },
      include: { roleAssignments: true, staffProfile: true },
    });
    const recipients = [
      administrator,
      manager,
      ...offerings.flatMap((o) =>
        o.faculty.map((f) => ({
          ...f.staffProfile.user,
          staffProfile: f.staffProfile,
        })),
      ),
    ];
    for (const user of [
      ...new Map(recipients.map((u) => [u.id, u])).values(),
    ]) {
      const isFaculty = user.roleAssignments.some((r) => r.role === 'FACULTY');
      const scoped = offerings.filter(
        (o) =>
          !isFaculty ||
          o.faculty.some((f) => f.staffProfile.userId === user.id),
      );
      const lines = [
        'Demonstration weekly review: 12–18 October 2026',
        '',
        'Calculated from the fictional evaluator semester. This preview was not emailed.',
        '',
      ];
      for (const offering of scoped) {
        const topics = offering.lessonPlans
          .flatMap((p) => p.units.flatMap((u) => u.topics))
          .filter((t) => t.status !== 'SKIPPED');
        const total = topics.reduce((n, t) => n + t.plannedMinutes, 0);
        const covered = topics.reduce(
          (n, t) =>
            n +
            t.plannedMinutes *
              (t.status === 'COMPLETED'
                ? 1
                : Number(t.currentCompletionPercentage) / 100),
          0,
        );
        const week = offering.sessions.filter(
          (s) =>
            s.sessionDate >= new Date('2026-10-12') &&
            s.sessionDate <= new Date('2026-10-18'),
        );
        const logged = week.filter((s) => s.logs.length);
        const remaining = (total - covered) / 60;
        const available = offering.sessions
          .filter(
            (s) =>
              s.sessionDate > new Date('2026-10-20') &&
              s.sessionDate <= new Date('2026-12-11') &&
              ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(s.status),
          )
          .reduce(
            (n, s) => n + (s.endsAt.getTime() - s.startsAt.getTime()) / 3600000,
            0,
          );
        lines.push(
          offering.subject.name,
          `Scheduled this week: ${week.length}. Logged: ${logged.length}. Awaiting a log: ${week.length - logged.length}.`,
          `Current recorded coverage: ${((covered / total) * 100).toFixed(2)}%. Remaining syllabus: ${remaining.toFixed(2)} hours. Available teaching: ${available.toFixed(2)} hours.`,
          `Buffer ratio: ${(available / remaining).toFixed(2)}. Next exam: Demo Mid-term, 2–4 November. Syllabus deadline: 30 October.`,
          remaining > available
            ? 'Suggested action: review the remaining topics and arrange extra teaching capacity.'
            : 'Suggested action: maintain the timetable and complete outstanding class logs.',
          '',
        );
      }
      await db.weeklySummary.upsert({
        where: {
          userId_campusId_weekStart: {
            userId: user.id,
            campusId: campus.id,
            weekStart: new Date('2026-10-12'),
          },
        },
        update: {},
        create: {
          userId: user.id,
          campusId: campus.id,
          weekStart: new Date('2026-10-12'),
          weekEnd: new Date('2026-10-18'),
          offeringIds: scoped.map((o) => o.id),
          accessKey: weeklyAccessKey({
            ...user,
            roles: user.roleAssignments,
            staffProfileId: user.staffProfile?.id ?? null,
          } as any),
          title: `Demo weekly review · ${campus.code} · 12–18 October`,
          text: lines.join('\n'),
          mode: 'demo',
          status: 'READY',
          emailStatus: 'NOT_SENT',
        },
      });
    }
    await db.auditEvent.createMany({
      data: [
        ['Demo semester loaded', 'academic-setup', 'Academic setup'],
        ['Demo batch timetable prepared', 'timetable', 'Timetable'],
        [
          'Demo teaching history and lesson plans loaded',
          'subjects',
          'Teaching',
        ],
      ].map(([title, view, category]) => ({
        actorId: administrator.id,
        campusId: campus.id,
        action: 'CREATE' as const,
        entityType: 'ActivityNotification',
        entityId: randomUUID(),
        metadata: {
          title,
          view,
          category,
          description: `${administrator.name}: ${title} — ${campus.semester}.`,
          actorName: administrator.name,
          globalOnly: false,
          campusId: campus.id,
          semesterId: campus.semesterId,
          offeringIds: offerings.map((o) => o.id),
          facultyUserIds: facultyIds,
        },
      })),
    });
    await db.auditEvent.create({
      data: {
        actorId: administrator.id,
        campusId: campus.id,
        action: 'CREATE',
        entityType: 'EvaluatorDemoEnriched',
        entityId: campus.semesterId,
      },
    });
  }
  const counts = await Promise.all(
    manifest.campuses.map(async (c: any) => ({
      campus: c.code,
      semesters: 1,
      faculty: c.faculty,
      students: c.students,
      subjects: await db.subjectOffering.count({
        where: { batch: { semesterId: c.semesterId } },
      }),
      topics: await db.topic.count({
        where: {
          unit: {
            lessonPlan: { offering: { batch: { semesterId: c.semesterId } } },
          },
        },
      }),
      sessions: await db.scheduledSession.count({
        where: { offering: { batch: { semesterId: c.semesterId } } },
      }),
      logs: await db.sessionLog.count({
        where: {
          scheduledSession: {
            offering: { batch: { semesterId: c.semesterId } },
          },
        },
      }),
      exams: await db.examWindow.count({ where: { semesterId: c.semesterId } }),
      calendarOverrides: await db.calendarDayOverride.count({
        where: { semesterId: c.semesterId },
      }),
    })),
  );
  await writeFile(
    process.env.EVALUATOR_PUBLIC_EVIDENCE!,
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        fictional: true,
        campuses: counts,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(counts));
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
