import { academicTrackIdentity } from '@mirai/calculations';
import { CALENDAR_REVIEW_REASON } from '../topic-schedule/calendar-review';
import {
  calculateExamReadiness,
  calculateSubjectProgress,
  rollUpProgress,
  SubjectProgressCalculation,
} from '@mirai/calculations';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { buildCsv, csvBuffer } from '../export/export-csv';
import { ReportQuery } from './reports.schemas';
import { topicDisplayTitle } from '../lesson-plan/topic-title';

type Identity = { id: string; name: string; code?: string };
export type ReportStatus =
  'ON_TRACK' | 'TIGHT' | 'DANGER' | 'COMPLETE' | 'NEEDS_DATA';
const person = { id: true, name: true } as const;
const identity = { id: true, name: true, code: true } as const;
const metadata = Prisma.validator<Prisma.SubjectOfferingInclude>()({
  subject: { select: identity },
  batch: {
    include: {
      track: { select: identity },
      semester: {
        include: { campus: { select: { ...identity, timezone: true } } },
      },
    },
  },
  faculty: {
    include: { staffProfile: { select: { user: { select: person } } } },
  },
});
const detail = Prisma.validator<Prisma.SubjectOfferingInclude>()({
  ...metadata,
  lessonPlans: {
    where: { status: { in: ['ACTIVE', 'DRAFT'] } },
    orderBy: { version: 'desc' },
    include: {
      units: {
        orderBy: { sequence: 'asc' },
        include: {
          topics: {
            orderBy: { sequence: 'asc' },
            include: { examScopes: { select: { examWindowId: true } } },
          },
        },
      },
    },
  },
  scheduleVersions: {
    orderBy: { version: 'desc' },
    take: 1,
    include: {
      entries: { select: { topicId: true, plannedFinishDate: true } },
    },
  },
  sessions: {
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    include: {
      facultyAssignment: {
        select: { staffProfile: { select: { user: { select: person } } } },
      },
      logs: {
        orderBy: { revision: 'desc' },
        take: 1,
        include: {
          loggedBy: { select: person },
          carryForwardTopic: {
            select: {
              title: true,
              unit: { select: { title: true } },
            },
          },
          topicUpdates: { select: { minutesUsed: true } },
        },
      },
    },
  },
});
// Summary screens need log existence, not every log's text, topic updates and author.
const courseDetail = Prisma.validator<Prisma.SubjectOfferingInclude>()({
  ...metadata,
  lessonPlans: {
    where: { status: { in: ['ACTIVE', 'DRAFT'] } },
    orderBy: { version: 'desc' },
    select: {
      status: true,
      version: true,
      units: {
        orderBy: { sequence: 'asc' },
        select: {
          title: true,
          topics: {
            orderBy: { sequence: 'asc' },
            select: {
              id: true,
              title: true,
              plannedMinutes: true,
              status: true,
              currentCompletionPercentage: true,
            },
          },
        },
      },
    },
  },
  scheduleVersions: detail.scheduleVersions,
  sessions: {
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      sessionDate: true,
      startsAt: true,
      endsAt: true,
      status: true,
      cancellationReason: true,
      logs: { take: 1, select: { id: true } },
    },
  },
});
type CourseOffering = Prisma.SubjectOfferingGetPayload<{
  include: typeof courseDetail;
}>;
type MetaOffering = Prisma.SubjectOfferingGetPayload<{
  include: typeof metadata;
}>;
type RowIdentity = {
  id: string;
  subject: Identity;
  campus: Identity;
  semester: Identity;
  batch: Identity;
  track: Identity;
  teachers: Identity[];
};
export type CourseRow = RowIdentity & {
  status: ReportStatus;
  reason: string;
  metrics: SubjectProgressCalculation | null;
  deadline: string;
  planStatus: string | null;
  planVersion: number | null;
  scheduled: number;
  logged: number;
  unlogged: number;
  upcoming: number;
  nextTopic: string | null;
  reviewChanges: number;
};
export type ExamRow = RowIdentity & {
  thresholds: { onTrack: number; tight: number };
  examId: string;
  exam: string;
  date: string;
  endDate: string;
  deadline: string;
  status: ReportStatus;
  scopeMode: string;
  coverage: number | null;
  remainingHours: number | null;
  teachingHours: number;
  bufferRatio: number | null;
  scopeTopics: number;
  reason: string;
};
export type DeliveryRow = RowIdentity & {
  date: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  teacher: Identity;
  status: string;
  revision: number;
  loggedAt: string;
  scheduledHours: number;
  recordedTopicHours: number | null;
  completion: number | null;
  covered: string;
  leftOver: string;
  carryForward: string;
  classwork: string;
  homework: string;
  notes: string;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const localDate = (d: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
const inRange = (date: string, q: ReportQuery) =>
  (!q.from || date >= q.from) && (!q.to || date <= q.to);
const hours = (s: { startsAt: Date; endsAt: Date }) =>
  (s.endsAt.getTime() - s.startsAt.getTime()) / 3600000;
const round = (n: number) => Math.round(n * 100) / 100;
const unique = (items: Identity[]) =>
  [...new Map(items.map((v) => [v.id, v])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
export const reportRank: Record<ReportStatus, number> = {
  DANGER: 4,
  TIGHT: 3,
  NEEDS_DATA: 2,
  ON_TRACK: 1,
  COMPLETE: 0,
};

export function reportScope(
  user: AuthenticatedUser,
): Prisma.SubjectOfferingWhereInput {
  if (user.roles.some((r) => ['ADMIN', 'PROGRAM_MANAGER'].includes(r.role)))
    return {};
  const scopes: Prisma.SubjectOfferingWhereInput[] = [];
  const campusIds = user.roles
    .filter((r) => r.role === 'CAMPUS_MANAGER' && r.campusId)
    .map((r) => r.campusId!);
  if (campusIds.length)
    scopes.push({ batch: { semester: { campusId: { in: campusIds } } } });
  const facultyCampuses = user.roles
    .filter((r) => r.role === 'FACULTY' && r.campusId)
    .map((r) => r.campusId!);
  if (facultyCampuses.length && user.staffProfileId)
    scopes.push({
      batch: { semester: { campusId: { in: facultyCampuses } } },
      faculty: { some: { staffProfileId: user.staffProfileId, active: true } },
    });
  if (!scopes.length)
    throw new ForbiddenException(
      'Reports require a campus or faculty assignment.',
    );
  return { OR: scopes };
}
function rowIdentity(o: MetaOffering): RowIdentity {
  return {
    id: o.id,
    subject: o.subject,
    campus: o.batch.semester.campus,
    semester: { id: o.batch.semester.id, name: o.batch.semester.name },
    batch: { id: o.batch.id, name: o.batch.name, code: o.batch.code },
    track: academicTrackIdentity(o.academicTrack),
    teachers: unique(
      o.faculty.filter((f) => f.active).map((f) => f.staffProfile.user),
    ),
  };
}
export function courseRow(o: CourseOffering, now: Date): CourseRow {
  const today = localDate(now, o.batch.semester.campus.timezone);
  const plan =
    o.lessonPlans.find((p) => p.status === 'ACTIVE') ?? o.lessonPlans[0];
  const dates = new Map(
    o.scheduleVersions[0]?.entries.map((e) => [
      e.topicId,
      iso(e.plannedFinishDate),
    ]) ?? [],
  );
  const topics =
    plan?.units.flatMap((u) =>
      u.topics.map((t) => ({
        id: t.id,
        title: topicDisplayTitle(t.title, u.title),
        plannedMinutes: t.plannedMinutes,
        status: t.status,
        completionPercentage: Number(t.currentCompletionPercentage),
        plannedFinishDate: dates.get(t.id) ?? null,
      })),
    ) ?? [];
  const hasHours = topics.some(
    (t) => t.status !== 'SKIPPED' && t.plannedMinutes > 0,
  );
  const metrics = hasHours
    ? calculateSubjectProgress({
        asOfDate: today,
        targetFinishDate: iso(o.targetFinishDate),
        topics,
        thresholds: {
          onTrack: Number(
            o.onTrackThreshold ?? o.batch.semester.defaultOnTrackThreshold,
          ),
          tight: Number(
            o.tightThreshold ?? o.batch.semester.defaultTightThreshold,
          ),
        },
        sessions: o.sessions.map((s) => ({
          sessionDate: iso(s.sessionDate),
          plannedMinutes: Math.round(hours(s) * 60),
          status: s.status,
        })),
      })
    : null;
  const needsData =
    !metrics ||
    plan?.status !== 'ACTIVE' ||
    !o.sessions.length ||
    !o.scheduleVersions.length;
  const status = needsData ? 'NEEDS_DATA' : metrics!.status;
  const reason = !hasHours
    ? 'Add lesson-plan hours to assess progress.'
    : plan?.status !== 'ACTIVE'
      ? 'Activate the lesson plan to assess progress.'
      : !o.sessions.length
        ? 'Add the timetable to assess teaching capacity.'
        : !o.scheduleVersions.length
          ? 'Calculate topic dates to compare delivery with the plan.'
          : metrics!.remainingHours === 0
            ? 'All in-scope topic completion is recorded.'
            : `${metrics!.availableHours} teaching hours remain for ${metrics!.remainingHours} hours of syllabus before ${iso(o.targetFinishDate)}.`;
  return {
    ...rowIdentity(o),
    status,
    reason,
    metrics,
    deadline: iso(o.targetFinishDate),
    planStatus: plan?.status ?? null,
    planVersion: plan?.version ?? null,
    scheduled: o.sessions.length,
    logged: o.sessions.filter((s) => s.logs.length).length,
    unlogged: o.sessions.filter(
      (s) =>
        s.endsAt <= now &&
        !s.logs.length &&
        ['SCHEDULED', 'COMPLETED', 'IN_PROGRESS'].includes(s.status),
    ).length,
    upcoming: o.sessions.filter(
      (s) => s.startsAt > now && s.status === 'SCHEDULED',
    ).length,
    nextTopic:
      topics.find(
        (t) =>
          !['SKIPPED', 'COMPLETED'].includes(t.status) &&
          t.completionPercentage < 100,
      )?.title ?? null,
    reviewChanges: o.sessions.filter(
      (s) =>
        s.status === 'CANCELLED' &&
        s.cancellationReason === CALENDAR_REVIEW_REASON,
    ).length,
  };
}
function groupRows(subjects: CourseRow[], kind: 'campus' | 'track') {
  const groups = new Map<string, CourseRow[]>();
  for (const s of subjects) {
    const key =
      kind === 'campus' ? s.campus.id : `${s.campus.id}:${s.track.id}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()].map(([id, rows]) => {
    const worst = [...rows].sort(
      (a, b) => reportRank[b.status] - reportRank[a.status],
    )[0]!;
    const known = rows.flatMap((s) => (s.metrics ? [s.metrics] : []));
    return {
      id,
      kind,
      name: rows[0]![kind].name,
      campus: rows[0]!.campus.name,
      subjectCount: rows.length,
      needsData: rows.filter((r) => r.status === 'NEEDS_DATA').length,
      status: worst.status,
      worstSubject: `${worst.subject.name} · ${worst.batch.name}`,
      metrics: known.length ? rollUpProgress(known) : null,
      logged: rows.reduce((n, r) => n + r.logged, 0),
      unlogged: rows.reduce((n, r) => n + r.unlogged, 0),
    };
  });
}

function reportSummary(
  subjects: CourseRow[],
  nextExam: { name: string; date: string; campus: string } | null,
) {
  const known = subjects.flatMap((s) => (s.metrics ? [s.metrics] : []));
  const worst = [...subjects].sort(
    (a, b) => reportRank[b.status] - reportRank[a.status],
  )[0];
  return {
    status: worst?.status ?? 'NEEDS_DATA',
    worstSubject: worst ? `${worst.subject.name} · ${worst.batch.name}` : null,
    metrics: known.length ? rollUpProgress(known) : null,
    subjects: subjects.length,
    assessed: subjects.filter((s) => s.status !== 'NEEDS_DATA').length,
    needsData: subjects.filter((s) => s.status === 'NEEDS_DATA').length,
    atRisk: subjects.filter((s) => ['DANGER', 'TIGHT'].includes(s.status))
      .length,
    behindHours: round(
      known.reduce((n, m) => n + Math.max(0, -m.paceVsPlanHours), 0),
    ),
    logged: subjects.reduce((n, s) => n + s.logged, 0),
    unlogged: subjects.reduce((n, s) => n + s.unlogged, 0),
    upcoming: subjects.reduce((n, s) => n + s.upcoming, 0),
    nextExam,
  };
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}
  async read(user: AuthenticatedUser, q: ReportQuery, compact = false) {
    const now = new Date();
    const scope = reportScope(user);
    const facultyOnly = !user.roles.some((r) =>
      ['ADMIN', 'PROGRAM_MANAGER', 'CAMPUS_MANAGER'].includes(r.role),
    );
    if (facultyOnly && !['course', 'delivery'].includes(q.tab))
      throw new ForbiddenException(
        'Faculty reports are limited to your assigned subjects and your own teaching.',
      );
    if (
      facultyOnly &&
      q.campusId &&
      !user.roles.some((r) => r.role === 'FACULTY' && r.campusId === q.campusId)
    )
      throw new ForbiddenException(
        'You can only report on your assigned campus and subjects.',
      );
    const activeCampusId = facultyOnly
      ? (q.campusId ??
        user.roles.find((r) => r.role === 'FACULTY' && r.campusId)?.campusId)
      : q.campusId;
    const global = user.roles.some((r) =>
      ['ADMIN', 'PROGRAM_MANAGER'].includes(r.role),
    );
    const [availableCampuses, permitted] = await Promise.all([
      this.db.campus.findMany({
        where: {
          active: true,
          ...(global
            ? {}
            : {
                id: {
                  in: user.roles
                    .filter((r) =>
                      facultyOnly
                        ? r.role === 'FACULTY'
                        : r.role === 'CAMPUS_MANAGER',
                    )
                    .flatMap((r) => (r.campusId ? [r.campusId] : [])),
                },
              }),
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      this.db.subjectOffering.findMany({
        where: {
          AND: [
            scope,
            { status: { in: ['DRAFT', 'ACTIVE', 'COMPLETE'] } },
            ...(activeCampusId
              ? [{ batch: { semester: { campusId: activeCampusId } } }]
              : []),
          ],
        },
        include: metadata,
        orderBy: { id: 'asc' },
      }),
    ]);
    const options = permitted.map((o) => ({
      ...rowIdentity(o),
      teachers: unique(o.faculty.map((f) => f.staffProfile.user)),
    }));
    // Select from authorized records first. Client-supplied IDs can only narrow this set.
    const filtered = permitted.filter(
      (o) =>
        (!activeCampusId || o.batch.semester.campusId === activeCampusId) &&
        (!q.trackId || o.academicTrack === q.trackId) &&
        (!q.semesterId || o.batch.semesterId === q.semesterId) &&
        (!q.batchId || o.batchId === q.batchId) &&
        (!q.subjectId || o.subjectId === q.subjectId) &&
        (!q.offeringId || o.id === q.offeringId) &&
        (!q.facultyId ||
          o.faculty.some((f) => f.staffProfile.user.id === q.facultyId)),
    );
    const ids = filtered.map((o) => o.id);
    if (compact) {
      const [offerings, exams] = await Promise.all([
        this.db.subjectOffering.findMany({
          where: { AND: [scope, { id: { in: ids } }] },
          include: {
            lessonPlans: courseDetail.lessonPlans,
            scheduleVersions: courseDetail.scheduleVersions,
            sessions: courseDetail.sessions,
          },
          orderBy: { subject: { name: 'asc' } },
        }),
        this.db.examWindow.findMany({
          where: {
            semesterId: {
              in: [...new Set(filtered.map((o) => o.batch.semesterId))],
            },
          },
          orderBy: { startDate: 'asc' },
        }),
      ]);
      const identities = new Map(filtered.map((o) => [o.id, o]));
      const subjects = offerings.map((o) =>
        courseRow({ ...identities.get(o.id)!, ...o }, now),
      );
      const next = exams.find((e) => {
        const offering = filtered.find(
          (o) => o.batch.semesterId === e.semesterId,
        );
        return (
          offering &&
          iso(e.endDate) >=
            localDate(now, offering.batch.semester.campus.timezone) &&
          (!q.from || iso(e.endDate) >= q.from) &&
          (!q.to || iso(e.startDate) <= q.to)
        );
      });
      return {
        generatedAt: now.toISOString(),
        facultyOnly,
        activeCampusId,
        availableCampuses,
        options,
        subjects,
        exams: [],
        delivery: [],
        faculty: [],
        groups: facultyOnly
          ? []
          : [
              ...groupRows(subjects, 'campus'),
              ...groupRows(
                subjects.filter((s) => s.track.id !== 'UNASSIGNED'),
                'track',
              ),
            ],
        summary: reportSummary(
          subjects,
          next
            ? {
                name: next.name,
                date: iso(next.startDate),
                campus: filtered.find(
                  (o) => o.batch.semesterId === next.semesterId,
                )!.batch.semester.campus.name,
              }
            : null,
        ),
      };
    }
    const [offerings, exams, uploads] = await Promise.all([
      this.db.subjectOffering.findMany({
        where: { AND: [scope, { id: { in: ids } }] },
        include: detail,
        orderBy: { subject: { name: 'asc' } },
      }),
      this.db.examWindow.findMany({
        where: {
          semesterId: {
            in: [...new Set(filtered.map((o) => o.batch.semesterId))],
          },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.db.lessonPlan.findMany({
        where: {
          offeringId: { in: ids },
          ...(facultyOnly ? { uploadedById: user.id } : {}),
        },
        select: {
          id: true,
          offeringId: true,
          status: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          uploadedBy: { select: person },
        },
      }),
    ]);
    const subjects = offerings.map((o) => courseRow(o, now));
    const examRows: ExamRow[] = [];
    const delivery: DeliveryRow[] = [];
    const activity = new Map<
      string,
      {
        id: string;
        name: string;
        subjects: string[];
        sessionsLogged: number;
        classesTaught: number;
        scheduledHours: number;
        plansUploaded: number;
        lastActivity: string | null;
        recent: { date: string; action: string; subject: string }[];
      }
    >();
    const facultyIds = new Set(
      permitted.flatMap((o) => o.faculty.map((f) => f.staffProfile.user.id)),
    );
    const facultyEntry = (p: Identity, label: string) => {
      if (!facultyIds.has(p.id)) return null;
      if (
        (facultyOnly && p.id !== user.id) ||
        (q.facultyId && p.id !== q.facultyId)
      )
        return null;
      const row = activity.get(p.id) ?? {
        ...p,
        subjects: [],
        sessionsLogged: 0,
        classesTaught: 0,
        scheduledHours: 0,
        plansUploaded: 0,
        lastActivity: null,
        recent: [],
      };
      if (!row.subjects.includes(label)) row.subjects.push(label);
      activity.set(p.id, row);
      return row;
    };
    for (const o of offerings) {
      const base = rowIdentity(o),
        timezone = o.batch.semester.campus.timezone;
      const label = `${o.subject.name} · ${o.batch.name}`;
      o.faculty
        .filter((f) => f.active)
        .forEach((f) => facultyEntry(f.staffProfile.user, label));
      for (const s of o.sessions) {
        const log = s.logs[0];
        if (!log) continue;
        const taught = ['COMPLETED', 'IN_PROGRESS'].includes(log.status);
        if (
          inRange(iso(s.sessionDate), q) &&
          (!facultyOnly || log.loggedById === user.id) &&
          (!q.facultyId || log.loggedById === q.facultyId) &&
          (q.deliveryStatus === 'ALL' ||
            (q.deliveryStatus === 'TAUGHT'
              ? taught
              : q.deliveryStatus === log.status))
        ) {
          const recorded = log.topicUpdates.filter(
            (t) => t.minutesUsed !== null,
          );
          delivery.push({
            ...base,
            id: s.id,
            date: iso(s.sessionDate),
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt.toISOString(),
            timezone,
            teacher: log.loggedBy,
            status: log.status,
            revision: log.revision,
            loggedAt: log.loggedAt.toISOString(),
            scheduledHours: round(hours(s)),
            recordedTopicHours: recorded.length
              ? round(
                  recorded.reduce((n, t) => n + (t.minutesUsed ?? 0), 0) / 60,
                )
              : null,
            completion:
              log.overallCompletionPercentage === null
                ? null
                : Number(log.overallCompletionPercentage),
            covered: log.coveredSummary,
            leftOver: log.leftOverSummary ?? '',
            carryForward: log.carryForwardTopic
              ? topicDisplayTitle(
                  log.carryForwardTopic.title,
                  log.carryForwardTopic.unit.title,
                )
              : '',
            classwork: log.classworkStatus,
            homework: log.homeworkStatus,
            notes: log.notes ?? '',
          });
        }
        if (inRange(localDate(log.loggedAt, timezone), q)) {
          const row = facultyEntry(log.loggedBy, label);
          if (row) {
            row.sessionsLogged++;
            if (taught) {
              row.classesTaught++;
              row.scheduledHours += hours(s);
            }
            row.recent.push({
              date: log.loggedAt.toISOString(),
              action: `Saved class log · ${log.status.toLowerCase().replaceAll('_', ' ')} · revision ${log.revision}`,
              subject: label,
            });
          }
        }
      }
      const plan =
        o.lessonPlans.find((p) => p.status === 'ACTIVE') ?? o.lessonPlans[0];
      const topics = plan?.units.flatMap((u) => u.topics) ?? [];
      const today = localDate(now, timezone);
      for (const exam of exams.filter(
        (e) =>
          e.semesterId === o.batch.semesterId &&
          iso(e.endDate) >= today &&
          (!q.from || iso(e.endDate) >= q.from) &&
          (!q.to || iso(e.startDate) <= q.to),
      )) {
        const scoped = topics.filter(
          (t) =>
            t.status !== 'SKIPPED' &&
            t.examScopes.some((s) => s.examWindowId === exam.id),
        );
        const readiness = calculateExamReadiness(
          scoped.map((t) => ({
            id: t.id,
            title: t.title,
            plannedMinutes: t.plannedMinutes,
            status: t.status,
            completionPercentage: Number(t.currentCompletionPercentage),
          })),
        );
        const capacity = calculateSubjectProgress({
          asOfDate: today,
          targetFinishDate: iso(exam.syllabusDeadline),
          thresholds: {
            onTrack: Number(
              o.onTrackThreshold ?? o.batch.semester.defaultOnTrackThreshold,
            ),
            tight: Number(
              o.tightThreshold ?? o.batch.semester.defaultTightThreshold,
            ),
          },
          topics: scoped.map((t) => ({
            id: t.id,
            title: t.title,
            plannedMinutes: t.plannedMinutes,
            status: t.status,
            completionPercentage: Number(t.currentCompletionPercentage),
          })),
          sessions: o.sessions.map((s) => ({
            sessionDate: iso(s.sessionDate),
            plannedMinutes: Math.round(hours(s) * 60),
            status: s.status,
          })),
        });
        const teachingHours = capacity.availableHours;
        const ratio = scoped.length ? capacity.bufferRatio : null;
        const needsData =
          !scoped.length || plan?.status !== 'ACTIVE' || !o.sessions.length;
        const status: ReportStatus = needsData ? 'NEEDS_DATA' : capacity.status;
        const scopeMode = !plan
          ? 'No lesson plan'
          : !scoped.length
            ? 'Scope not set'
            : plan.status !== 'ACTIVE'
              ? 'Draft plan'
              : !o.sessions.length
                ? 'Timetable missing'
                : 'Assessed';
        examRows.push({
          ...base,
          id: `${o.id}:${exam.id}`,
          examId: exam.id,
          exam: exam.name,
          date: iso(exam.startDate),
          endDate: iso(exam.endDate),
          deadline: iso(exam.syllabusDeadline),
          status,
          scopeMode,
          coverage: scoped.length ? readiness.coveragePercentage : null,
          remainingHours: scoped.length ? readiness.hoursStillNeeded : null,
          teachingHours,
          bufferRatio: ratio === null ? null : round(ratio),
          thresholds: capacity.thresholds,
          scopeTopics: scoped.length,
          reason: needsData
            ? scopeMode
            : readiness.hoursStillNeeded === 0
              ? 'In-scope completion is fully recorded.'
              : `${teachingHours} teaching hours available for ${readiness.hoursStillNeeded} hours of in-scope syllabus by ${iso(exam.syllabusDeadline)}.`,
        });
      }
    }
    for (const plan of uploads) {
      const o = offerings.find((o) => o.id === plan.offeringId);
      if (
        !o ||
        !inRange(localDate(plan.createdAt, o.batch.semester.campus.timezone), q)
      )
        continue;
      const row = facultyEntry(
        plan.uploadedBy,
        `${o.subject.name} · ${o.batch.name}`,
      );
      if (row) {
        row.plansUploaded++;
        row.recent.push({
          date: plan.createdAt.toISOString(),
          action: `Uploaded lesson plan v${plan.version} · ${plan.status.toLowerCase()}`,
          subject: `${o.subject.name} · ${o.batch.name}`,
        });
      }
    }
    const faculty = [...activity.values()]
      .map((row) => {
        row.recent.sort((a, b) => b.date.localeCompare(a.date));
        return {
          ...row,
          scheduledHours: round(row.scheduledHours),
          lastActivity: row.recent[0]?.date ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    delivery.sort(
      (a, b) =>
        b.startsAt.localeCompare(a.startsAt) || a.id.localeCompare(b.id),
    );
    examRows.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        reportRank[b.status] - reportRank[a.status],
    );
    return {
      generatedAt: now.toISOString(),
      facultyOnly,
      activeCampusId,
      availableCampuses,
      options,
      subjects,
      exams: examRows,
      delivery,
      faculty,
      groups: facultyOnly
        ? []
        : [
            ...groupRows(subjects, 'campus'),
            ...groupRows(
              subjects.filter((s) => s.track.id !== 'UNASSIGNED'),
              'track',
            ),
          ],
      summary: reportSummary(
        subjects,
        examRows[0]
          ? {
              name: examRows[0].exam,
              date: examRows[0].date,
              campus: examRows[0].campus.name,
            }
          : null,
      ),
    };
  }

  async csv(user: AuthenticatedUser, q: ReportQuery) {
    const data = await this.read(user, q);
    const context = (r: RowIdentity) => ({
      Campus: r.campus.name,
      Track: r.track.name,
      Semester: r.semester.name,
      Batch: r.batch.name,
      Subject: r.subject.name,
      'Subject code': r.subject.code,
      Faculty: r.teachers.map((t) => t.name).join('; '),
    });
    let rows: Record<string, string | number | null | undefined>[];
    switch (q.tab) {
      case 'delivery':
        rows = data.delivery.map((r) => ({
          ...context(r),
          Date: r.date,
          'Starts at': r.startsAt,
          'Ends at': r.endsAt,
          Timezone: r.timezone,
          'Logged by': r.teacher.name,
          Status: r.status,
          'Scheduled hours': r.scheduledHours,
          'Recorded topic hours': r.recordedTopicHours,
          'Completion %': r.completion,
          Covered: r.covered,
          Leftover: r.leftOver,
          'Carry forward': r.carryForward,
          Classwork: r.classwork,
          Homework: r.homework,
          Notes: r.notes,
          Revision: r.revision,
          'Logged at': r.loggedAt,
        }));
        break;
      case 'faculty':
        rows = data.faculty.map((r) => ({
          Faculty: r.name,
          Subjects: r.subjects.join('; '),
          'Sessions logged': r.sessionsLogged,
          'Classes recorded as taught': r.classesTaught,
          'Scheduled hours of taught classes': r.scheduledHours,
          'Plans uploaded': r.plansUploaded,
          'Last activity': r.lastActivity,
          Activity: r.recent
            .map((a) => `${a.date}: ${a.action} (${a.subject})`)
            .join('\n'),
        }));
        break;
      case 'exams':
        rows = data.exams.map((r) => ({
          ...context(r),
          Exam: r.exam,
          'Exam date': r.date,
          'Syllabus deadline': r.deadline,
          'Readiness status': r.status,
          'Coverage %': r.coverage,
          'Syllabus left (h)': r.remainingHours,
          'Teaching left (h)': r.teachingHours,
          'Buffer ratio': r.bufferRatio,
          'Scope mode': r.scopeMode,
          'Scope topics': r.scopeTopics,
          Reason: r.reason,
        }));
        break;
      case 'campus':
        rows = data.groups.map((r) => ({
          Group: r.kind,
          Name: r.name,
          Campus: r.campus,
          Subjects: r.subjectCount,
          'Needs data': r.needsData,
          Status: r.status,
          'Worst subject': r.worstSubject,
          'Coverage %': r.metrics?.coveragePercentage,
          'Planned hours': r.metrics?.hoursInScope,
          'Covered hours': r.metrics?.coveredHours,
          'Remaining hours': r.metrics?.remainingHours,
          'Available hours': r.metrics?.availableHours,
          'Buffer ratio': r.metrics?.bufferRatio,
          'Logged classes': r.logged,
          'Unlogged classes': r.unlogged,
        }));
        break;
      default:
        rows = data.subjects.map((r) => ({
          ...context(r),
          Status: r.status,
          'Coverage %': r.metrics?.coveragePercentage,
          'Planned hours': r.metrics?.hoursInScope,
          'Covered hours': r.metrics?.coveredHours,
          'Remaining hours': r.metrics?.remainingHours,
          'Teaching left (h)': r.metrics?.availableHours,
          'Planned by today (h)': r.metrics?.plannedHoursByToday,
          'Behind plan (h)': r.metrics
            ? Math.max(0, -r.metrics.paceVsPlanHours)
            : null,
          'Buffer ratio': r.metrics?.bufferRatio,
          Deadline: r.deadline,
          'Plan status': r.planStatus,
          'Logged classes': r.logged,
          'Unlogged classes': r.unlogged,
          Reason: r.reason,
        }));
    }
    const headers = rows.length
      ? Object.keys(rows[0]!)
      : ['No matching records'];
    return {
      filename: `mirai-${q.tab}-report-${data.generatedAt.slice(0, 10)}.csv`,
      content: csvBuffer(
        buildCsv(
          rows,
          headers.map((header) => ({ header, value: (r) => r[header] })),
        ),
      ),
    };
  }
}
