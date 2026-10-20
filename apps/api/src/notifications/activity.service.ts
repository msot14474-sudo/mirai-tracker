import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { randomUUID } from 'node:crypto';
export type ActivityScope = {
  campusId?: string;
  semesterId?: string;
  offeringIds: string[];
  targetUserId?: string;
  name?: string;
  facultyCampus?: boolean;
};
export type ActivityChange = { title: string; view: string; category: string };
export function changeFor(method: string, path: string): ActivityChange | null {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return null;
  if (
    /\/(preview|inspect|verify|recovery-options|report|test-email|process-due|generate-report)$/.test(
      path,
    )
  )
    return null;
  const verb =
    method === 'DELETE'
      ? 'removed'
      : method === 'PATCH' || method === 'PUT'
        ? 'updated'
        : 'added';
  if (path.startsWith('/academic/'))
    return {
      title: path.includes('/teacher')
        ? 'Subject teacher assigned'
        : path.includes('/subjects')
          ? `Subject ${verb}`
          : path.includes('exam')
            ? `Exam dates ${verb}`
            : path.includes('calendar')
              ? `Semester calendar ${verb}`
              : `Semester ${verb}`,
      view: 'academic-setup',
      category: 'Academic setup',
    };
  if (path.startsWith('/faculty-access/'))
    return {
      title:
        method === 'PATCH'
          ? 'Account access updated'
          : path.includes('/managers')
            ? 'Campus manager added'
            : path.includes('/administrators')
              ? 'Administrator added'
              : 'Faculty added',
      view: 'faculty-access',
      category: 'Team & access',
    };
  if (path.startsWith('/timetable/'))
    return {
      title: path.endsWith('/import')
        ? 'Batch timetable uploaded'
        : path.includes('extra-classes')
          ? 'Extra class added'
          : path.endsWith('/move')
            ? 'Class rescheduled'
            : `Timetable ${verb}`,
      view: 'timetable',
      category: 'Timetable',
    };
  if (path.startsWith('/topic-schedules/'))
    return {
      title: path.endsWith('/calculate')
        ? 'Lesson dates recalculated'
        : path.endsWith('/move')
          ? 'Class rescheduled'
          : 'Class schedule updated',
      view: 'planned-dates',
      category: 'Teaching',
    };
  if (path.startsWith('/lesson-plans/'))
    return {
      title: path.endsWith('/activate')
        ? 'Lesson plan activated'
        : path.endsWith('/import')
          ? 'Lesson plan uploaded'
          : 'Lesson plan updated',
      view: 'lesson-plans',
      category: 'Teaching',
    };
  if (path.startsWith('/session-logs/'))
    return {
      title: 'Class log saved',
      view: 'daily-logging',
      category: 'Teaching',
    };
  if (path.startsWith('/imports/'))
    return {
      title: path.includes('/calendar/')
        ? 'Semester calendar imported'
        : 'Course data imported',
      view: 'academic-setup',
      category: 'Academic setup',
    };
  if (path === '/imports')
    return {
      title: 'Semester data imported',
      view: 'academic-setup',
      category: 'Academic setup',
    };
  if (path.startsWith('/campus-data/'))
    return path.endsWith('/import')
      ? {
          title: 'Semester data imported',
          view: 'full-semester-import',
          category: 'Imports',
        }
      : path.includes('/visiting-faculty/')
        ? {
            title:
              method === 'DELETE'
                ? 'Expense or payment voided'
                : path.endsWith('/rates')
                  ? 'Visiting faculty rate updated'
                  : 'Expense or payment recorded',
            view: 'visiting-faculty',
            category: 'Expenses',
          }
        : null;
  return null;
}
const uuid = (x: unknown): x is string =>
  typeof x === 'string' && /^[a-f0-9-]{36}$/i.test(x);
@Injectable()
export class ActivityService {
  constructor(private readonly db: PrismaService) {}
  async resolve(
    params: Record<string, string>,
    body: Record<string, unknown>,
    result?: any,
  ): Promise<ActivityScope> {
    const scope: ActivityScope = { offeringIds: [] };
    let semesterId = params.semesterId ?? body.semesterId ?? result?.semesterId;
    let campusId = params.campusId ?? body.campusId ?? result?.campusId;
    let offeringId = params.offeringId ?? body.offeringId ?? result?.offeringId;
    let subjectId = params.subjectId ?? body.subjectId;
    const userId =
      params.userId ??
      result?.userId ??
      result?.user?.id ??
      result?.faculty?.id ??
      result?.account?.id;
    if (uuid(userId)) {
      scope.targetUserId = userId;
      const target = await this.db.user.findUnique({
        where: { id: userId },
        include: { roleAssignments: true },
      });
      scope.name = target?.name;
      campusId ??= target?.roleAssignments.find((r) => r.campusId)?.campusId;
    }
    if (uuid(params.calendarDayId)) {
      const day = await this.db.calendarDayOverride.findUnique({
        where: { id: params.calendarDayId },
      });
      if (day) {
        semesterId = day.semesterId;
        scope.name = day.title;
      }
    }
    if (uuid(params.examWindowId)) {
      const exam = await this.db.examWindow.findUnique({
        where: { id: params.examWindowId },
      });
      if (exam) {
        semesterId = exam.semesterId;
        scope.name = exam.name;
      }
    }
    if (uuid(params.sessionId)) {
      const s = await this.db.scheduledSession.findUnique({
        where: { id: params.sessionId },
      });
      if (s) offeringId = s.offeringId;
    }
    if (uuid(params.entryId)) {
      const e = await this.db.timetableEntry.findUnique({
        where: { id: params.entryId },
      });
      if (e) offeringId = e.offeringId;
    }
    if (uuid(params.planId)) {
      const p = await this.db.lessonPlan.findUnique({
        where: { id: params.planId },
      });
      if (p) offeringId = p.offeringId;
    }
    if (uuid(params.unitId)) {
      const u = await this.db.unit.findUnique({
        where: { id: params.unitId },
        include: { lessonPlan: true },
      });
      if (u) offeringId = u.lessonPlan.offeringId;
    }
    if (uuid(params.topicId)) {
      const t = await this.db.topic.findUnique({
        where: { id: params.topicId },
        include: { unit: { include: { lessonPlan: true } } },
      });
      if (t) offeringId = t.unit.lessonPlan.offeringId;
    }
    if (uuid(params.batchId)) {
      const b = await this.db.batch.findUnique({
        where: { id: params.batchId },
        include: { subjectOfferings: { select: { id: true } } },
      });
      if (b) semesterId = b.semesterId;
      scope.offeringIds = b?.subjectOfferings.map((o) => o.id) ?? [];
      scope.name ??= b?.name;
    }
    if (uuid(offeringId)) {
      const o = await this.db.subjectOffering.findUnique({
        where: { id: offeringId },
        include: { batch: true, subject: true },
      });
      if (o) {
        scope.offeringIds = [o.id];
        semesterId = o.batch.semesterId;
        scope.name ??= `${o.subject.name} · ${o.batch.name}`;
      }
    }
    if (uuid(subjectId)) {
      const s = await this.db.subject.findUnique({
        where: { id: subjectId },
        include: { offerings: { select: { id: true } } },
      });
      if (s) campusId = s.campusId;
      scope.offeringIds = s?.offerings.map((o) => o.id) ?? [];
      scope.name ??= s?.name;
    }
    // Campus-data endpoints use :id for the semester.
    if (uuid(body._semesterId)) semesterId = body._semesterId;
    if (uuid(semesterId)) {
      const s = await this.db.semester.findUnique({
        where: { id: semesterId },
      });
      if (s) campusId = s.campusId;
      scope.semesterId = s?.id;
      scope.name ??= s?.name;
    }
    if (uuid(campusId)) scope.campusId = campusId;
    if (!scope.name && typeof result?.name === 'string')
      scope.name = result.name.slice(0, 200);
    return scope;
  }
  async publish(
    user: AuthenticatedUser,
    change: ActivityChange,
    scope: ActivityScope,
  ) {
    const globalActor = user.roles.some((r) =>
      ['ADMIN', 'PROGRAM_MANAGER'].includes(r.role),
    );
    if (
      !globalActor &&
      (!scope.campusId ||
        !user.roles.some((r) => r.campusId === scope.campusId))
    )
      throw new ForbiddenException(
        'Activity must belong to the actor’s campus.',
      );
    const globalOnly = !scope.campusId;
    let facultyUserIds: string[] = [];
    if (
      scope.campusId &&
      change.category !== 'Team & access' &&
      change.category !== 'Expenses'
    ) {
      const faculty = await this.db.facultyAssignment.findMany({
        where: {
          active: true,
          offering: {
            batch: {
              semester: { campusId: scope.campusId },
              ...(scope.semesterId ? { semesterId: scope.semesterId } : {}),
            },
          },
          ...(scope.offeringIds.length
            ? { offeringId: { in: scope.offeringIds } }
            : {}),
        },
        select: { staffProfile: { select: { userId: true } } },
      });
      facultyUserIds = [...new Set(faculty.map((f) => f.staffProfile.userId))];
      if (
        !scope.offeringIds.length &&
        ['Academic setup', 'Imports'].includes(change.category)
      )
        scope.facultyCampus = true;
    }
    if (scope.targetUserId && change.category === 'Team & access')
      facultyUserIds.push(scope.targetUserId);
    const description = `${user.name}: ${change.title}${scope.name ? ` — ${scope.name}` : ''}.`;
    // Store only display-safe activity metadata, never request bodies, passwords or financial amounts.
    return this.db.auditEvent.create({
      data: {
        actorId: user.id,
        campusId: scope.campusId,
        action: 'UPDATE',
        entityType: 'ActivityNotification',
        entityId: randomUUID(),
        metadata: {
          ...change,
          description,
          actorName: user.name,
          globalOnly,
          ...scope,
          facultyUserIds,
        } as Prisma.InputJsonValue,
      },
    });
  }
  private async scope(user: AuthenticatedUser, campusId?: string) {
    const global = user.roles.some((r) =>
      ['ADMIN', 'PROGRAM_MANAGER'].includes(r.role),
    );
    const managed = user.roles
      .filter((r) => r.role === 'CAMPUS_MANAGER' && r.campusId)
      .map((r) => r.campusId!);
    const facultyCampuses = user.roles
      .filter((r) => r.role === 'FACULTY' && r.campusId)
      .map((r) => r.campusId!);
    const offerings = user.staffProfileId
      ? await this.db.facultyAssignment.findMany({
          where: {
            staffProfileId: user.staffProfileId,
            active: true,
            offering: {
              batch: { semester: { campusId: { in: facultyCampuses } } },
            },
          },
          select: { offeringId: true },
        })
      : [];
    const base: Prisma.AuditEventWhereInput = {
      entityType: 'ActivityNotification',
      ...(campusId ? { campusId } : {}),
      ...(!global
        ? {
            OR: [
              { campusId: { in: managed } },
              {
                AND: [
                  { campusId: { in: facultyCampuses } },
                  {
                    metadata: {
                      path: ['facultyUserIds'],
                      array_contains: [user.id],
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    return {
      base,
      global,
      managed,
      offeringIds: new Set(offerings.map((o) => o.offeringId)),
    };
  }
  async feed(user: AuthenticatedUser, campusId?: string, before?: string) {
    const scope = await this.scope(user, campusId);
    const events = await this.db.auditEvent.findMany({
      where: {
        ...scope.base,
        ...(before ? { occurredAt: { lt: new Date(before) } } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 60,
    });
    const visible = events.filter((e) => {
      const m = e.metadata as any;
      return (
        scope.global ||
        scope.managed.includes(e.campusId!) ||
        m.targetUserId === user.id ||
        m.facultyCampus ||
        m.offeringIds?.some((id: string) => scope.offeringIds.has(id))
      );
    });
    const reads = await this.db.activityRead.findMany({
      where: { userId: user.id, eventId: { in: visible.map((e) => e.id) } },
    });
    const read = new Set(reads.map((r) => r.eventId));
    return {
      items: visible.map((e) => ({
        id: e.id,
        ...(e.metadata as object),
        createdAt: e.occurredAt,
        read: read.has(e.id),
      })),
      nextBefore:
        events.length === 60 ? events.at(-1)!.occurredAt.toISOString() : null,
    };
  }
  async markRead(user: AuthenticatedUser, ids: string[]) {
    const scope = await this.scope(user);
    const events = await this.db.auditEvent.findMany({
      where: { ...scope.base, id: { in: ids } },
    });
    const allowed = events.filter((e) => {
      const m = e.metadata as any;
      return (
        scope.global ||
        scope.managed.includes(e.campusId!) ||
        m.targetUserId === user.id ||
        m.facultyCampus ||
        m.offeringIds?.some((id: string) => scope.offeringIds.has(id))
      );
    });
    if (allowed.length !== new Set(ids).size)
      throw new NotFoundException(
        'Notification is not available in your current access.',
      );
    await this.db.activityRead.createMany({
      data: allowed.map((e) => ({ userId: user.id, eventId: e.id })),
      skipDuplicates: true,
    });
    return { read: allowed.length };
  }
}
