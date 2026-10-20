/**
 * Additive, fictional evaluator data. Never resets existing semesters/accounts.
 * Local scale profile: 3 campuses / 60 faculty / 30 subjects / 1,020 students.
 * Live demo profile: 3 existing campuses / 15 faculty / 15 subjects / 30 students.
 * Credentials are written only to EVALUATOR_PRIVATE_OUTPUT (mode 0600).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { hashPassword } from '../src/auth/password';
import {
  buildTimetableSessions,
  timetableTime,
} from '../src/timetable/timetable-engine';
import { calculateTopicSchedule } from '../src/topic-schedule/topic-schedule.engine';
import { calculateSubjectProgress } from '@mirai/calculations';

const db = new PrismaClient();
const scale = process.env.EVALUATOR_PROFILE === 'scale';
const live = process.env.EVALUATOR_TARGET === 'live';
const local = ['localhost', '127.0.0.1', 'postgres'].includes(
  new URL(process.env.DATABASE_URL!).hostname,
);
const password = process.env.EVALUATOR_PASSWORD;
const output = process.env.EVALUATOR_PRIVATE_OUTPUT;
const notificationEmail = process.env.EVALUATOR_NOTIFICATION_EMAIL || null;
const semesterName = 'Evaluator Demo · Odd Semester 2026';
const start = '2026-07-20',
  finish = '2026-12-18',
  asOf = '2026-10-20';
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const campuses = [
  { code: 'HI-TECH', name: 'HI-Tech Campus', slug: 'hitech' },
  { code: 'JAGGANNATH', name: 'Jaggannath Campus', slug: 'jaggannath' },
  { code: 'RATHINAM', name: 'Rathinam Campus', slug: 'rathinam' },
];
const subjects = [
  [
    'DSA',
    'Data Structures and Algorithms',
    'MIRAI',
    [
      'Algorithm analysis',
      'Arrays and strings',
      'Linked lists',
      'Stacks and queues',
      'Trees',
      'Graph traversal',
    ],
  ],
  [
    'WEB',
    'Web Development',
    'MIRAI',
    [
      'Semantic HTML',
      'Responsive CSS',
      'JavaScript foundations',
      'DOM and events',
      'React components',
      'APIs and deployment',
    ],
  ],
  [
    'DB',
    'Database Systems',
    'MIRAI',
    [
      'Relational models',
      'SQL queries',
      'Joins and aggregation',
      'Normalization',
      'Transactions',
      'Indexes and query plans',
    ],
  ],
  [
    'MATH',
    'Discrete Mathematics',
    'UNIVERSITY',
    [
      'Sets and relations',
      'Propositional logic',
      'Proof techniques',
      'Combinatorics',
      'Graph theory',
      'Recurrence relations',
    ],
  ],
  [
    'COMM',
    'Professional Communication',
    'UNIVERSITY',
    [
      'Professional writing',
      'Listening skills',
      'Presentations',
      'Technical documentation',
      'Team discussions',
      'Interview practice',
    ],
  ],
] as const;
const names = [
  'Aarav Mehta',
  'Diya Sharma',
  'Kabir Rao',
  'Meera Iyer',
  'Rohan Sen',
];
const manifest: any = {
  generatedAt: new Date().toISOString(),
  fictional: true,
  profile: scale ? 'scale' : 'demo',
  asOf,
  accounts: [],
  campuses: [],
};

async function main() {
  if (!password || password.length < 16 || !output)
    throw new Error(
      'Set a private output path and EVALUATOR_PASSWORD (16+ characters).',
    );
  if (!local && !live)
    throw new Error('Remote seeding requires EVALUATOR_TARGET=live.');
  if (live && scale)
    throw new Error('Scale data is restricted to a local database.');
  if (
    local &&
    process.env.EVALUATOR_SKIP_EXISTING === '1' &&
    (await db.semester.count({
      where: {
        name: semesterName,
        campus: { code: { in: campuses.map((c) => c.code) } },
      },
    })) === 3
  ) {
    console.log(
      'The three evaluator semesters already exist. Keeping the existing data.',
    );
    return;
  }
  if (live) {
    const existing = await db.campus.findMany({
      where: { active: true },
      select: { code: true },
    });
    if (
      existing.length !== 3 ||
      campuses.some((c) => !existing.some((e) => e.code === c.code))
    )
      throw new Error(
        'Live seed requires exactly the three configured campuses.',
      );
    if (!notificationEmail)
      throw new Error(
        'Set an evaluator OTP delivery mailbox for live demonstration accounts.',
      );
  }
  const track =
    (await db.track.findFirst({
      where: { OR: [{ code: 'MIRAI' }, { name: 'Mirai Track' }] },
    })) ??
    (await db.track.create({ data: { code: 'MIRAI', name: 'Mirai Track' } }));
  const subjectCount = scale ? 10 : 5,
    facultyCount = scale ? 20 : 5,
    studentCount = scale ? 340 : 10;
  let actorId: string;
  if (live) {
    const admin = await db.user.findFirst({
      where: { status: 'ACTIVE', roleAssignments: { some: { role: 'ADMIN' } } },
      select: { id: true },
    });
    if (!admin)
      throw new Error('An existing active administrator is required.');
    actorId = admin.id;
  } else {
    actorId = (
      await createAccount(db, 'admin', 'Evaluator Administrator', 'ADMIN', null)
    ).id;
    await createAccount(
      db,
      'program',
      'Evaluator Program Manager',
      'PROGRAM_MANAGER',
      null,
    );
  }
  for (const campusSpec of campuses) {
    const campus = live
      ? await db.campus.findUniqueOrThrow({ where: { code: campusSpec.code } })
      : await db.campus.upsert({
          where: { code: campusSpec.code },
          update: {},
          create: campusSpecRecord(campusSpec),
        });
    const existing = await db.semester.findUnique({
      where: { campusId_name: { campusId: campus.id, name: semesterName } },
    });
    if (existing)
      throw new Error(
        `Evaluator semester already exists in ${campus.code}. No existing data was changed; use a fresh local database or retain the original private manifest.`,
      );
    const result = await db.$transaction(
      async (tx) => {
        const semester = await tx.semester.create({
          data: {
            campusId: campus.id,
            name: semesterName,
            startDate: date(start),
            endDate: date(finish),
            workingSaturdayRule: 'SECOND_AND_FOURTH',
            status: 'ACTIVE',
          },
        });
        const batch = await tx.batch.create({
          data: {
            semesterId: semester.id,
            trackId: track.id,
            code: 'EVAL-A',
            name: 'Evaluator First Year A',
          },
        });
        const manager = await createAccount(
          tx,
          `${campusSpec.slug}.manager`,
          `Demo ${campusSpec.name} Manager`,
          'CAMPUS_MANAGER',
          campus.id,
        );
        const exams = await Promise.all([
          tx.examWindow.create({
            data: {
              semesterId: semester.id,
              name: 'Demo Mid-term',
              type: 'MID_TERM',
              startDate: date('2026-11-02'),
              endDate: date('2026-11-04'),
              syllabusDeadline: date('2026-10-30'),
            },
          }),
          tx.examWindow.create({
            data: {
              semesterId: semester.id,
              name: 'Demo End-term',
              type: 'END_TERM',
              startDate: date('2026-12-14'),
              endDate: date('2026-12-18'),
              syllabusDeadline: date('2026-12-11'),
            },
          }),
        ]);
        const overrides: any[] = [
          ['2026-08-15', 'Independence Day', 'HOLIDAY', false],
          ['2026-10-02', 'Gandhi Jayanti', 'HOLIDAY', false],
          ['2026-10-22', 'Demo campus event', 'EVENT', false],
          ['2026-11-09', 'Demo holiday', 'HOLIDAY', false],
          ['2026-11-14', 'Demo extra teaching day', 'EXTRA_WORKING_DAY', true],
          ...['02', '03', '04'].map((d) => [
            `2026-11-${d}`,
            'Demo Mid-term examination',
            'EVENT',
            false,
          ]),
          ...['14', '15', '16', '17', '18'].map((d) => [
            `2026-12-${d}`,
            'Demo End-term examination',
            'EVENT',
            false,
          ]),
        ].map(([d, title, type, teachingAllowed]) => ({
          date: d,
          title,
          type,
          teachingAllowed,
        }));
        await tx.calendarDayOverride.createMany({
          data: overrides.map((o) => ({
            ...o,
            semesterId: semester.id,
            date: date(o.date),
            notes:
              'Fictional evaluator dataset; not an institutional calendar.',
          })),
        });
        const faculty: any[] = [];
        for (let i = 0; i < facultyCount; i++) {
          const user = await createAccount(
            tx,
            `${campusSpec.slug}.faculty${i + 1}`,
            `Demo ${names[i % 5]} ${Math.floor(i / 5) + 1} · ${campusSpec.code}`,
            'FACULTY',
            campus.id,
          );
          const staff = await tx.staffProfile.create({
            data: {
              userId: user.id,
              employeeCode: `EVAL-${campusSpec.code}-${i + 1}`,
              staffType: i % 5 === 4 ? 'VISITING' : 'REGULAR',
            },
          });
          faculty.push({ user, staff });
        }
        const studentRows = Array.from({ length: studentCount }, (_, i) => ({
          id: randomUUID(),
          name: `Demo Student ${i + 1} · ${campusSpec.code}`,
          email: `evaluator.${campusSpec.slug}.student${i + 1}@mirai.local`,
          notificationEmail,
          status: 'ACTIVE' as const,
        }));
        await tx.user.createMany({ data: studentRows });
        await tx.roleAssignment.createMany({
          data: studentRows.map((u) => ({
            userId: u.id,
            role: 'STUDENT',
            campusId: campus.id,
            scopeKey: campus.id,
          })),
        });
        await tx.studentProfile.createMany({
          data: studentRows.map((u, i) => ({
            userId: u.id,
            batchId: batch.id,
            studentCode: `EVAL-${campusSpec.code}-S${i + 1}`,
          })),
        });
        await tx.passwordCredential.create({
          data: {
            userId: studentRows[0]!.id,
            ...(await hashPassword(password!)),
          },
        });
        manifest.accounts.push({
          ...studentRows[0],
          role: 'STUDENT',
          campusId: campus.id,
        });
        const offeringSummaries: any[] = [];
        for (let i = 0; i < subjectCount; i++) {
          const spec = subjects[i % 5]!,
            owner = faculty[i]!;
          const subject = await tx.subject.create({
            data: {
              campusId: campus.id,
              code: `EVAL-${campusSpec.code}-${spec[0]}${i >= 5 ? '-2' : ''}`,
              name: `${spec[1]}${i >= 5 ? ' II' : ''} (Demo)`,
              description:
                'Fictional evaluator subject. Safe to distinguish from existing academic records.',
            },
          });
          await tx.subjectTeacher.create({
            data: {
              subjectId: subject.id,
              staffProfileId: owner.staff.id,
              campusId: campus.id,
            },
          });
          const offering = await tx.subjectOffering.create({
            data: {
              subjectId: subject.id,
              batchId: batch.id,
              academicTrack: spec[2],
              targetFinishDate: date('2026-12-11'),
              status: 'ACTIVE',
            },
          });
          const assignment = await tx.facultyAssignment.create({
            data: {
              offeringId: offering.id,
              staffProfileId: owner.staff.id,
              startDate: date(start),
              type: i % 5 === 4 ? 'VISITING' : 'PRIMARY',
            },
          });
          if (scale)
            await tx.facultyAssignment.create({
              data: {
                offeringId: offering.id,
                staffProfileId: faculty[i + 10]!.staff.id,
                startDate: date(start),
                type: 'CO_FACULTY',
              },
            });
          const hour = [9, 10, 11, 13, 14][i % 5]!;
          const entries = [i < 5 ? 1 : 2, i < 5 ? 3 : 4, i < 5 ? 5 : 6].map(
            (weekday) => ({
              id: randomUUID(),
              offeringId: offering.id,
              facultyAssignmentId: assignment.id,
              weekday,
              startTime: `${String(hour).padStart(2, '0')}:00`,
              endTime: `${String(hour + 1).padStart(2, '0')}:00`,
              effectiveFrom: start,
              effectiveTo: '2026-12-11',
            }),
          );
          await tx.timetableEntry.createMany({
            data: entries.map((e) => ({
              ...e,
              startTime: timetableTime(e.startTime),
              endTime: timetableTime(e.endTime),
              effectiveFrom: date(e.effectiveFrom),
              effectiveTo: date(e.effectiveTo),
            })),
          });
          const planned = buildTimetableSessions({
            offeringId: offering.id,
            timezone: campus.timezone,
            semesterStart: start,
            semesterEnd: finish,
            saturdayRule: 'SECOND_AND_FOURTH',
            overrides,
            entries,
          });
          const sessions = planned.map((s) => ({ ...s, id: randomUUID() }));
          const past = sessions.filter((s) => s.sessionDate < asOf);
          const logged = past.slice(
            0,
            Math.max(0, past.length - ((i % 5) + 1)),
          );
          const loggedIds = new Set(logged.map((s) => s.id));
          await tx.scheduledSession.createMany({
            data: sessions.map(({ plannedMinutes: _, ...s }) => ({
              ...s,
              offeringId: offering.id,
              sessionDate: date(s.sessionDate),
              status: loggedIds.has(s.id) ? 'COMPLETED' : 'SCHEDULED',
            })),
          });
          const plan = await tx.lessonPlan.create({
            data: {
              offeringId: offering.id,
              version: 1,
              status: 'ACTIVE',
              uploadedById: owner.user.id,
              approvedById: owner.user.id,
              approvedAt: date(start),
              fileName: `evaluator-${spec[0]}-lesson-plan.csv`,
            },
          });
          const minutesPerTopic = [90, 120, 150, 120, 90][i % 5]!;
          const topics: any[] = [];
          for (let unit = 0; unit < 6; unit++) {
            const saved = await tx.unit.create({
              data: {
                lessonPlanId: plan.id,
                sequence: unit + 1,
                title: spec[3][unit]!,
              },
            });
            for (let t = 0; t < 5; t++)
              topics.push({
                id: randomUUID(),
                unitId: saved.id,
                sequence: t + 1,
                title: `${spec[3][unit]}: ${['foundations', 'worked examples', 'guided practice', 'application lab', 'review and assessment'][t]}`,
                plannedMinutes: minutesPerTopic,
                status: 'NOT_STARTED',
                currentCompletionPercentage: 0,
                unitSequence: unit + 1,
                unitTitle: saved.title,
              });
          }
          let used = 0;
          const updates: any[] = [],
            logs: any[] = [];
          for (const [n, s] of logged.entries()) {
            const logId = randomUUID(),
              before = used,
              delivered = n % 7 === 6 ? 45 : 60;
            used = Math.min(topics.length * minutesPerTopic, used + delivered);
            const covered: string[] = [];
            for (const [t, topic] of topics.entries()) {
              const prev = Math.min(
                100,
                Math.max(
                  0,
                  ((before - t * minutesPerTopic) / minutesPerTopic) * 100,
                ),
              );
              const next = Math.min(
                100,
                Math.max(
                  0,
                  ((used - t * minutesPerTopic) / minutesPerTopic) * 100,
                ),
              );
              if (next <= prev) continue;
              topic.currentCompletionPercentage = Math.round(next * 100) / 100;
              topic.status = next === 100 ? 'COMPLETED' : 'IN_PROGRESS';
              covered.push(topic.title);
              updates.push({
                sessionLogId: logId,
                topicId: topic.id,
                completionBeforePercentage: prev,
                completionAfterPercentage: next,
                minutesUsed: Math.round(
                  ((next - prev) * minutesPerTopic) / 100,
                ),
              });
            }
            logs.push({
              id: logId,
              scheduledSessionId: s.id,
              revision: 1,
              status: delivered === 60 ? 'COMPLETED' : 'IN_PROGRESS',
              overallCompletionPercentage: (delivered / 60) * 100,
              coveredSummary:
                covered.join('; ') ||
                'Revision and practice of previously covered topics.',
              leftOverSummary:
                delivered === 45
                  ? 'Continue the remaining practice problems next class.'
                  : null,
              classworkStatus: 'COMPLETED',
              homeworkStatus: n % 3 === 0 ? 'ASSIGNED' : 'NOT_ASSIGNED',
              notes:
                'Synthetic evaluator history; not a real attendance record.',
              loggedById: owner.user.id,
              loggedAt: new Date(s.endsAt.getTime() + 300000),
            });
          }
          await tx.topic.createMany({
            data: topics.map(({ unitSequence: _, unitTitle: __, ...t }) => t),
          });
          await tx.sessionLog.createMany({ data: logs });
          await tx.sessionTopicUpdate.createMany({ data: updates });
          await tx.examScope.createMany({
            data: exams.flatMap((e, n) =>
              topics
                .filter((_, t) => n === 1 || t < 15)
                .map((t) => ({ examWindowId: e.id, topicId: t.id })),
            ),
          });
          const schedule = calculateTopicSchedule(
            topics.map((t) => ({
              id: t.id,
              title: t.title,
              unitSequence: t.unitSequence,
              unitTitle: t.unitTitle,
              topicSequence: t.sequence,
              requiredMinutes: t.plannedMinutes,
            })),
            sessions.map((s) => ({
              ...s,
              status: loggedIds.has(s.id) ? 'COMPLETED' : 'SCHEDULED',
            })),
          );
          const version = await tx.topicScheduleVersion.create({
            data: { offeringId: offering.id, version: 1, reason: 'INITIAL' },
          });
          await tx.topicSchedule.createMany({
            data: schedule.allocations.map((t) => ({
              scheduleVersionId: version.id,
              topicId: t.id,
              plannedStartDate: date(t.plannedStartDate),
              plannedFinishDate: date(t.plannedFinishDate),
              allocatedMinutes: t.allocatedMinutes,
            })),
          });
          if (i % 5 === 4) {
            await tx.visitingFacultyRate.create({
              data: {
                campusId: campus.id,
                staffProfileId: owner.staff.id,
                effectiveFrom: date(start),
                ratePerClass: 1500,
              },
            });
            await tx.visitingFacultyLedger.createMany({
              data: [
                {
                  semesterId: semester.id,
                  staffProfileId: owner.staff.id,
                  date: date('2026-10-01'),
                  kind: 'EXPENSE',
                  category: 'Travel',
                  amount: 1200,
                  notes: 'Fictional evaluator travel expense.',
                  reference: `EVAL-TRAVEL-${i}`,
                },
                {
                  semesterId: semester.id,
                  staffProfileId: owner.staff.id,
                  date: date('2026-10-05'),
                  kind: 'PAYMENT',
                  category: 'Honorarium',
                  amount: 15000,
                  notes: 'Fictional evaluator payment.',
                  reference: `EVAL-PAYMENT-${i}`,
                },
              ],
            });
          }
          const metrics = calculateSubjectProgress({
            asOfDate: asOf,
            targetFinishDate: '2026-12-11',
            topics: topics.map((t) => ({
              ...t,
              completionPercentage: t.currentCompletionPercentage,
            })),
            sessions: sessions.map((s) => ({
              sessionDate: s.sessionDate,
              plannedMinutes: s.plannedMinutes,
              status: loggedIds.has(s.id) ? 'COMPLETED' : 'SCHEDULED',
            })),
          });
          offeringSummaries.push({
            offeringId: offering.id,
            subject: subject.name,
            facultyId: owner.user.id,
            sessions: sessions.length,
            logs: logs.length,
            topics: topics.length,
            metrics,
          });
        }
        await tx.auditEvent.create({
          data: {
            actorId,
            campusId: campus.id,
            action: 'CREATE',
            entityType: 'EvaluatorDataset',
            entityId: semester.id,
            after: {
              fictional: true,
              subjects: subjectCount,
              faculty: facultyCount,
              students: studentCount,
            },
          },
        });
        return {
          code: campus.code,
          id: campus.id,
          semesterId: semester.id,
          semester: semesterName,
          batchId: batch.id,
          managerId: manager.id,
          faculty: facultyCount,
          students: studentCount,
          subjects: offeringSummaries,
        };
      },
      { timeout: 600000, maxWait: 30000 },
    );
    manifest.campuses.push(result);
    await persist();
    console.log(
      `${campus.code}: ${result.subjects.length} subjects, ${result.faculty} faculty, ${result.students} students`,
    );
  }
  await persist();
}
function campusSpecRecord(c: (typeof campuses)[number]) {
  return { code: c.code, name: c.name, timezone: 'Asia/Kolkata' };
}
async function createAccount(
  tx: any,
  suffix: string,
  name: string,
  role: string,
  campusId: string | null,
) {
  const user = await tx.user.create({
    data: {
      email: `evaluator.${suffix}@mirai.local`,
      name,
      notificationEmail,
      status: 'ACTIVE',
    },
  });
  await tx.roleAssignment.create({
    data: { userId: user.id, role, campusId, scopeKey: campusId ?? 'GLOBAL' },
  });
  await tx.passwordCredential.create({
    data: { userId: user.id, ...(await hashPassword(password!)) },
  });
  manifest.accounts.push({
    id: user.id,
    email: user.email,
    name,
    role,
    campusId,
  });
  return user;
}
async function persist() {
  await mkdir(dirname(output!), { recursive: true });
  await writeFile(output!, JSON.stringify({ ...manifest, password }, null, 2), {
    mode: 0o600,
  });
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
