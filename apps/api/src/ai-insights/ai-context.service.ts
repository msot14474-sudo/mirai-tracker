import { calculateSubjectProgress, calculateExamReadiness } from '@mirai/calculations';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

export function insightScope(
  user: AuthenticatedUser,
): Prisma.SubjectOfferingWhereInput {
  if (
    user.roles.some((r) => r.role === 'ADMIN' || r.role === 'PROGRAM_MANAGER')
  )
    return {};
  const scopes: Prisma.SubjectOfferingWhereInput[] = [];
  const campuses = user.roles
    .filter((r) => r.role === 'CAMPUS_MANAGER' && r.campusId)
    .map((r) => r.campusId!);
  if (campuses.length)
    scopes.push({ batch: { semester: { campusId: { in: campuses } } } });
  if (user.staffProfileId && user.roles.some((r) => r.role === 'FACULTY'))
    scopes.push({
      faculty: { some: { staffProfileId: user.staffProfileId, active: true } },
    });
  if (!scopes.length)
    throw new ForbiddenException(
      'AI insights are available to administrators, campus managers and assigned faculty.',
    );
  return { OR: scopes };
}
export type InsightFilter = { campusId?: string; offeringId?: string };

@Injectable()
export class AiContextService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(user: AuthenticatedUser, filter: InsightFilter = {}) {
    const now = new Date();
    const offerings = await this.prisma.subjectOffering.findMany({
      where: {
        AND: [
          insightScope(user),
          {
            ...(filter.campusId
              ? { batch: { semester: { campusId: filter.campusId } } }
              : {}),
            ...(filter.offeringId ? { id: filter.offeringId } : {}),
            status: { in: ['DRAFT', 'ACTIVE', 'COMPLETE'] },
          },
        ],
      },
      take: 1001,
      orderBy: { id: 'asc' },
      include: {
        subject: { select: { name: true, code: true } },
        sessions: {select: {sessionDate: true, startsAt: true, endsAt: true, status: true}},
        timetableEntries: {
          where: { active: true },
          select: {
            weekday: true,
            startTime: true,
            endTime: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        },
        batch: {
          select: {
            name: true,
            semester: {
              select: {
                name: true,
                campus: { select: { id: true, name: true, timezone: true } },
                defaultOnTrackThreshold: true, defaultTightThreshold: true,
                examWindows: {
                  select: {
                    id: true,
                    name: true,
                    startDate: true,
                    endDate: true,
                    syllabusDeadline: true,
                  },
                },
              },
            },
          },
        },
        faculty: {
          where: { active: true },
          select: {
            staffProfile: { select: { user: { select: { name: true } } } },
          },
        },
        lessonPlans: {
          where: { status: { in: ['ACTIVE', 'DRAFT'] } },
          orderBy: { version: 'desc' },
          include: {
            units: {
              orderBy: { sequence: 'asc' },
              include: {
                topics: {
                  orderBy: { sequence: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    plannedMinutes: true,
                    status: true,
                    currentCompletionPercentage: true,
                    examScopes: { select: { examWindowId: true } },
                  },
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
      },
    });
    if (offerings.length > 1000)
      throw new BadRequestException(
        'Select a campus or subject to analyse a smaller scope.',
      );
    const global = user.roles.some(
      (r) => r.role === 'ADMIN' || r.role === 'PROGRAM_MANAGER',
    );
    const managedCampusIds = user.roles
      .filter((r) => r.role === 'CAMPUS_MANAGER' && r.campusId)
      .map((r) => r.campusId!);
    const permittedCampusIds = [
      ...new Set([
        ...managedCampusIds,
        ...offerings.map((o) => o.batch.semester.campus.id),
      ]),
    ];
    const campusWhere: Prisma.CampusWhereInput = {
      AND: [
        global ? {} : { id: { in: permittedCampusIds } },
        filter.campusId ? { id: filter.campusId } : {},
      ],
    };
    const [campuses, semesters, catalog] = await Promise.all([
      this.prisma.campus.findMany({
        where: campusWhere,
        select: { id: true, name: true, timezone: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.prisma.semester.findMany({
        where: { campus: campusWhere },
        select: {
          name: true,
          startDate: true,
          endDate: true,
          status: true,
          workingSaturdayRule: true,
          campus: { select: { name: true } },
          calendarDays: {
            select: {
              date: true,
              title: true,
              type: true,
              teachingAllowed: true,
            },
            orderBy: { date: 'asc' },
          },
          examWindows: {
            select: {
              name: true,
              type: true,
              startDate: true,
              endDate: true,
              syllabusDeadline: true,
            },
          },
        },
        orderBy: { startDate: 'desc' },
        take: 100,
      }),
      global || managedCampusIds.length
        ? this.prisma.subject.findMany({
            where: {
              active: true,
              campus: {
                AND: [
                  campusWhere,
                  global ? {} : { id: { in: managedCampusIds } },
                ],
              },
            },
            select: { code: true, name: true, description: true },
            orderBy: { code: 'asc' },
            take: 200,
          })
        : Promise.resolve([]),
    ]);
    const ids = offerings.map((o) => o.id);
    const sessionScope = { offeringId: { in: ids } };
    const pastScope = { ...sessionScope, endsAt: { lte: now } };
    const missingLogScope = {
      ...pastScope,
      status: {
        in: ['SCHEDULED', 'COMPLETED', 'IN_PROGRESS'] as (
          'SCHEDULED' | 'COMPLETED' | 'IN_PROGRESS'
        )[],
      },
    };
    const [
      sessionCounts,
      missingLogs,
      feedbackCounts,
      recentLectures,
      upcomingLectures,
      recentGaps,
      totalPast,
      totalUpcoming,
      totalLogged,
    ] = await Promise.all([
      this.prisma.scheduledSession.groupBy({
        by: ['offeringId', 'status'],
        where: sessionScope,
        _count: { _all: true },
      }),
      this.prisma.scheduledSession.groupBy({
        by: ['offeringId'],
        where: { ...missingLogScope, logs: { none: {} } },
        _count: { _all: true },
      }),
      this.prisma.lectureReview.groupBy({
        by: ['understood'],
        where: { session: sessionScope },
        _count: { _all: true },
      }),
      this.prisma.scheduledSession.findMany({
        where: pastScope,
        orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
        take: 80,
        select: {
          id: true,
          offeringId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          logs: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: {
              notes: true,
              carryForwardTopic: { select: { title: true } },
              coveredSummary: true,
              leftOverSummary: true,
              classworkStatus: true,
              homeworkStatus: true,
            },
          },
        },
      }),
      this.prisma.scheduledSession.findMany({
        where: { ...sessionScope, startsAt: { gt: now }, status: 'SCHEDULED' },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 20,
        select: { id: true, offeringId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.lectureReview.findMany({
        where: { understood: false, session: sessionScope },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          unclearTopics: true,
          updatedAt: true,
          session: { select: { id: true, offeringId: true, startsAt: true } },
        },
      }),
      this.prisma.scheduledSession.count({ where: pastScope }),
      this.prisma.scheduledSession.count({
        where: { ...sessionScope, startsAt: { gt: now }, status: 'SCHEDULED' },
      }),
      // Count sessions with evidence, not log revisions or timetable entries.
      this.prisma.scheduledSession.count({
        where: { ...sessionScope, logs: { some: {} } },
      }),
    ]);
    const subjects = offerings.map((o) => {
      const plan =
        o.lessonPlans.find((p) => p.status === 'ACTIVE') ?? o.lessonPlans[0];
      const dates = new Map(
        o.scheduleVersions[0]?.entries.map((e) => [
          e.topicId,
          e.plannedFinishDate.toISOString().slice(0, 10),
        ]) ?? [],
      );
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: o.batch.semester.campus.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      const topics =
        plan?.units.flatMap((u) =>
          u.topics.map((t) => ({
            id: t.id,
            unit: u.title,
            title: t.title,
            description: t.description,
            minutes: t.plannedMinutes,
            completion: t.status === 'COMPLETED' ? 100 : Number(t.currentCompletionPercentage),
            status: t.status,
            finishDate: dates.get(t.id) ?? null,
            examIds: t.examScopes.map((e) => e.examWindowId),
          })),
        ) ?? [];
      const inScope = topics.filter(t => t.status !== 'SKIPPED');
      const minutes = inScope.reduce((a, t) => a + t.minutes, 0);
      const completedMinutes = inScope.reduce(
        (a, t) => a + (t.status === 'COMPLETED' ? t.minutes : (t.minutes * t.completion) / 100),
        0,
      );
      const monitoring = plan && minutes > 0 && o.targetFinishDate ? calculateSubjectProgress({
        asOfDate: today, targetFinishDate: o.targetFinishDate.toISOString().slice(0,10),
        thresholds: {onTrack: Number(o.onTrackThreshold ?? o.batch.semester.defaultOnTrackThreshold ?? 1.15), tight: Number(o.tightThreshold ?? o.batch.semester.defaultTightThreshold ?? 1)},
        topics: topics.map(t => ({id:t.id,title:t.title,plannedMinutes:t.minutes,status:t.status,completionPercentage:t.completion,plannedFinishDate:t.finishDate})),
        sessions: (o.sessions ?? []).map(session => ({sessionDate:session.sessionDate.toISOString().slice(0,10),plannedMinutes:Math.round((session.endsAt.getTime()-session.startsAt.getTime())/60000),status:session.status})),
      }) : null;
      const overdue = topics.filter(
        (t) =>
          t.finishDate &&
          t.finishDate < today &&
          t.completion < 100 &&
          t.status !== 'SKIPPED',
      );
      const unlogged =
        missingLogs.find((m) => m.offeringId === o.id)?._count._all ?? 0;
      const issues: string[] = [];
      if (!plan) issues.push('Add a lesson plan.');
      else if (plan.status !== 'ACTIVE')
        issues.push('Review and activate the draft lesson plan.');
      if (!o.scheduleVersions.length)
        issues.push('Calculate planned topic dates.');
      if (overdue.length)
        issues.push(
          `Replan ${overdue.length} overdue topic${overdue.length === 1 ? '' : 's'}.`,
        );
      if (unlogged)
        issues.push(
          `Follow up on ${unlogged} lecture${unlogged === 1 ? '' : 's'} without logs.`,
        );
      if (!o.faculty.length) issues.push('Assign a faculty member.');
      if (!o.timetableEntries?.length) issues.push('Create the weekly timetable.');
      if (monitoring?.status === 'DANGER') issues.push(`Teaching capacity is below remaining work: ${monitoring.availableHours} hours available, ${monitoring.remainingHours} hours remaining before the deadline.`);
      if (monitoring?.status === 'TIGHT') issues.push('The timetable has little recovery buffer before the deadline.');
      const recentHelp = recentGaps.filter(
        (g) => g.session.offeringId === o.id,
      ).length;
      if (recentHelp)
        issues.push(
          `Review ${recentHelp} recent student understanding-gap responses.`,
        );
      const exams = o.batch.semester.examWindows
        .filter(
          (e) => (e.endDate ?? e.startDate).toISOString().slice(0, 10) >= today,
        )
        .map((e) => {
          const scoped = inScope.filter((t) => t.examIds.includes(e.id));
          const readiness = calculateExamReadiness(scoped.map(t => ({id:t.id,title:t.title,plannedMinutes:t.minutes,status:t.status,completionPercentage:t.completion})));
          return {
            readiness,
            name: e.name,
            date: e.startDate.toISOString().slice(0, 10),
            syllabusDeadline: e.syllabusDeadline.toISOString().slice(0, 10),
            endDate: (e.endDate ?? e.startDate).toISOString().slice(0, 10),
            scopeDefined: scoped.length > 0,
            plannedMinutes: readiness.minutes.planned,
            remainingMinutes: readiness.minutes.stillNeeded,
            scopeTopics: scoped.length,
            incompleteTopics: scoped.filter((t) => t.completion < 100).length,
          };
        });
      for (const e of exams) {
        if (!e.scopeDefined) issues.push(`${e.name}: define the exam syllabus scope.`);
        if (e.syllabusDeadline <= today && e.incompleteTopics)
          issues.push(
            `${e.name}: ${e.incompleteTopics} exam topics remain at the syllabus deadline.`,
          );
      }
      return {
        monitoring: monitoring ? { ...monitoring, status: plan?.status !== 'ACTIVE' || !o.sessions?.length ? 'NEEDS_DATA' : monitoring.status } : null,
        id: o.id,
        status: o.status,
        localDate: today,
        timetable: o.timetableEntries,
        code: o.subject.code,
        name: o.subject.name,
        batch: o.batch.name,
        campus: o.batch.semester.campus,
        semester: o.batch.semester.name,
        teachers: o.faculty.map((f) => f.staffProfile.user.name),
        plan: plan
          ? {
              version: plan.version,
              status: plan.status,
              fileName: plan.fileName,
            }
          : null,
        completion: minutes
          ? Math.round((completedMinutes / minutes) * 100)
          : null,
        plannedMinutes: minutes,
        coveredMinutes: completedMinutes,
        remainingMinutes: Math.max(0, minutes - completedMinutes),
        overdueTopics: overdue.length,
        missingLogs: unlogged,
        topics,
        nextTopics: topics
          .filter((t) => t.completion < 100 && t.status !== 'SKIPPED')
          .slice(0, 3)
          .map((t) => t.title),
        issues,
        exams,
        sessions: sessionCounts
          .filter((s) => s.offeringId === o.id)
          .map((s) => ({ status: s.status, count: s._count._all })),
      };
    });
    const needsHelp =
      feedbackCounts.find((f) => !f.understood)?._count._all ?? 0;
    return {
      generatedAt: now.toISOString(),
      viewer: {
        name: user.name,
        roles: [...new Set(user.roles.map((r) => r.role))],
      },
      setup: {
        campuses,
        semesters,
        catalog,
        limits:
          'Up to 100 permitted campuses, 100 most recent semesters, and 200 catalog subjects. Faculty context includes only assigned subjects and their campus calendars.',
      },
      scope: filter.campusId
        ? 'Selected campus · permitted subjects'
        : 'All permitted subjects',
      coverage: {
        subjects: subjects.length,
        pastLectures: totalPast,
        loggedLectures: totalLogged,
        recentLecturesIncluded: recentLectures.length,
        upcomingLectures: totalUpcoming,
        upcomingIncluded: upcomingLectures.length,
        feedbackGaps: needsHelp,
        feedbackGapsIncluded: recentGaps.length,
        note: 'All permitted draft/active/completed subjects, current plans and aggregate lecture/feedback totals. loggedLectures counts distinct classes with saved logs, not revisions. missingLogs counts ended timetable classes requiring a log that have none; upcomingLectures counts future scheduled classes. Detailed context includes the latest 80 past lectures, next 20 lectures and 50 recent understanding gaps. Select a subject for deeper focus. Coverage is recorded topic progress, which can also come from imports. Missing logs or zero recorded coverage do not prove that no teaching took place. Subjects without plan hours have unknown coverage.',
      },
      summary: {
        subjects: subjects.length,
        attention: subjects.filter((s) => s.issues.length).length,
        overdueTopics: subjects.reduce((a, s) => a + s.overdueTopics, 0),
        missingLogs: subjects.reduce((a, s) => a + s.missingLogs, 0),
        needsHelp,
        reviews: feedbackCounts.reduce((a, f) => a + f._count._all, 0),
      },
      subjects,
      recentLectures,
      upcomingLectures,
      recentGaps,
    };
  }
}
export type InsightSnapshot = Awaited<ReturnType<AiContextService['snapshot']>>;
