import { TopicScheduleService } from '../topic-schedule/topic-schedule.service';
import {
  Prisma,
  ScheduledSessionStatus,
  ScheduleCalculationReason,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatIsoDate,
  parseIsoDate,
} from '../academic-calendar/calendar-engine';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  buildTimetableSessions,
  durationMinutes,
  formatTimetableTime,
  timetableTime,
} from './timetable-engine';
import {
  CreateTimetableEntryInput,
  UpdateTimetableEntryInput,
} from './timetable.schemas';

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly schedules: TopicScheduleService,
  ) {}

  async listSemesterOfferings(semesterId: string, user: AuthenticatedUser) {
    const semester = await this.prisma.semester.findUnique({
      where: { id: semesterId },
      select: {
        id: true,
        campusId: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!semester) throw new NotFoundException('Semester not found.');
    this.access.assertCanManageCampus(user, semester.campusId);

    const offerings = await this.prisma.subjectOffering.findMany({
      where: { batch: { semesterId } },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        batch: { select: { id: true, code: true, name: true } },
        timetableEntries: {
          where: { active: true },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        },
        _count: { select: { sessions: true } },
      },
      orderBy: [{ batch: { code: 'asc' } }, { subject: { code: 'asc' } }],
    });

    return {
      semester: {
        ...semester,
        startDate: formatIsoDate(semester.startDate),
        endDate: formatIsoDate(semester.endDate),
      },
      offerings: offerings.map((offering) => ({
        id: offering.id,
        subject: offering.subject,
        batch: offering.batch,
        targetFinishDate: formatIsoDate(offering.targetFinishDate),
        entries: offering.timetableEntries.map(serializeEntry),
        weeklyPlannedMinutes: offering.timetableEntries.reduce(
          (total, entry) =>
            total +
            durationMinutes(
              formatTimetableTime(entry.startTime),
              formatTimetableTime(entry.endTime),
            ),
          0,
        ),
        generatedSessions: offering._count.sessions,
      })),
    };
  }

  async offering(offeringId: string, user: AuthenticatedUser) {
    const offering = await this.requireOffering(offeringId);
    this.access.assertCanManageCampus(user, offering.batch.semester.campusId);
    const sessions = await this.prisma.scheduledSession.findMany({
      where: { offeringId },
      orderBy: [{ startsAt: 'asc' }],
    });
    const activeEntries = offering.timetableEntries.filter(
      (entry) => entry.active,
    );
    return {
      id: offering.id,
      subject: offering.subject,
      batch: {
        id: offering.batch.id,
        code: offering.batch.code,
        name: offering.batch.name,
      },
      semester: {
        id: offering.batch.semester.id,
        name: offering.batch.semester.name,
        startDate: formatIsoDate(offering.batch.semester.startDate),
        endDate: formatIsoDate(offering.batch.semester.endDate),
        campus: offering.batch.semester.campus,
      },
      facultyAssignments: offering.faculty.map((assignment) => ({
        id: assignment.id,
        type: assignment.type,
        active: assignment.active,
        startDate: formatIsoDate(assignment.startDate),
        endDate: assignment.endDate ? formatIsoDate(assignment.endDate) : null,
        staff: assignment.staffProfile.user,
      })),
      entries: offering.timetableEntries.map(serializeEntry),
      sessions: sessions.map((session) => ({
        id: session.id,
        timetableEntryId: session.timetableEntryId,
        sessionDate: formatIsoDate(session.sessionDate),
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        plannedMinutes: Math.round(
          (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
        ),
        status: session.status,
      })),
      summary: {
        weeklyPlannedMinutes: activeEntries.reduce(
          (total, entry) =>
            total +
            durationMinutes(
              formatTimetableTime(entry.startTime),
              formatTimetableTime(entry.endTime),
            ),
          0,
        ),
        generatedSessions: sessions.length,
        semesterPlannedMinutes: sessions
          .filter(
            (session) => session.status !== ScheduledSessionStatus.CANCELLED,
          )
          .reduce(
            (total, session) =>
              total +
              Math.round(
                (session.endsAt.getTime() - session.startsAt.getTime()) /
                  60_000,
              ),
            0,
          ),
      },
    };
  }

  async createEntry(
    offeringId: string,
    input: CreateTimetableEntryInput,
    user: AuthenticatedUser,
  ) {
    const offering = await this.requireOffering(offeringId);
    this.access.assertCanManageCampus(user, offering.batch.semester.campusId);
    await this.validateEntry(offering, input);
    const created = await this.prisma.timetableEntry.create({
      data: {
        offeringId,
        facultyAssignmentId: input.facultyAssignmentId,
        weekday: input.weekday,
        startTime: timetableTime(input.startTime),
        endTime: timetableTime(input.endTime),
        effectiveFrom: parseIsoDate(input.effectiveFrom),
        effectiveTo: parseIsoDate(input.effectiveTo),
      },
    });
    const generation = await this.regenerateOffering(offeringId, user);
    return { entry: serializeEntry(created), generation };
  }

  async updateEntry(
    entryId: string,
    input: UpdateTimetableEntryInput,
    user: AuthenticatedUser,
  ) {
    const current = await this.requireEntry(entryId);
    const offering = await this.requireOffering(current.offeringId);
    this.access.assertCanManageCampus(user, offering.batch.semester.campusId);
    const merged: CreateTimetableEntryInput = {
      weekday: input.weekday ?? current.weekday,
      startTime: input.startTime ?? formatTimetableTime(current.startTime),
      endTime: input.endTime ?? formatTimetableTime(current.endTime),
      effectiveFrom:
        input.effectiveFrom ?? formatIsoDate(current.effectiveFrom),
      effectiveTo:
        input.effectiveTo ??
        formatIsoDate(current.effectiveTo ?? offering.batch.semester.endDate),
      facultyAssignmentId:
        input.facultyAssignmentId === undefined
          ? current.facultyAssignmentId
          : input.facultyAssignmentId,
    };
    await this.validateEntry(offering, merged, entryId);
    const updated = await this.prisma.timetableEntry.update({
      where: { id: entryId },
      data: {
        weekday: input.weekday,
        startTime: input.startTime ? timetableTime(input.startTime) : undefined,
        endTime: input.endTime ? timetableTime(input.endTime) : undefined,
        effectiveFrom: input.effectiveFrom
          ? parseIsoDate(input.effectiveFrom)
          : undefined,
        effectiveTo: input.effectiveTo
          ? parseIsoDate(input.effectiveTo)
          : undefined,
        facultyAssignmentId: input.facultyAssignmentId,
        active: true,
      },
    });
    const generation = await this.regenerateOffering(current.offeringId, user);
    return { entry: serializeEntry(updated), generation };
  }

  async archiveEntry(entryId: string, user: AuthenticatedUser) {
    const current = await this.requireEntry(entryId);
    const offering = await this.requireOffering(current.offeringId);
    this.access.assertCanManageCampus(user, offering.batch.semester.campusId);
    await this.prisma.timetableEntry.update({
      where: { id: entryId },
      data: { active: false },
    });
    return this.regenerateOffering(current.offeringId, user);
  }

  async generate(offeringId: string, user: AuthenticatedUser) {
    const offering = await this.requireOffering(offeringId);
    this.access.assertCanManageCampus(user, offering.batch.semester.campusId);
    return this.regenerateOffering(offeringId, user);
  }

  private async validateEntry(
    offering: Awaited<ReturnType<TimetableService['requireOffering']>>,
    input: CreateTimetableEntryInput,
    excludeEntryId?: string,
  ) {
    try {
      durationMinutes(input.startTime, input.endTime);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid timetable time.',
      );
    }
    const semester = offering.batch.semester;
    if (
      input.effectiveTo < input.effectiveFrom ||
      input.effectiveFrom < formatIsoDate(semester.startDate) ||
      input.effectiveTo > formatIsoDate(semester.endDate)
    ) {
      throw new BadRequestException(
        'Timetable effective dates must be ordered and inside the semester.',
      );
    }

    const selectedAssignment = input.facultyAssignmentId
      ? offering.faculty.find((item) => item.id === input.facultyAssignmentId)
      : undefined;
    if (input.facultyAssignmentId) {
      if (!selectedAssignment || !selectedAssignment.active) {
        throw new BadRequestException(
          'Select an active faculty assignment for this subject offering.',
        );
      }
      if (
        formatIsoDate(selectedAssignment.startDate) > input.effectiveFrom ||
        (selectedAssignment.endDate &&
          formatIsoDate(selectedAssignment.endDate) < input.effectiveTo)
      ) {
        throw new BadRequestException(
          'Faculty assignment dates must cover the timetable entry.',
        );
      }
    }

    const scopeOptions: Prisma.TimetableEntryWhereInput[] = [
      { offering: { batchId: offering.batchId } },
    ];
    if (selectedAssignment) {
      scopeOptions.push({
        facultyAssignment: {
          staffProfileId: selectedAssignment.staffProfileId,
        },
      });
    }
    const conflict = await this.prisma.timetableEntry.findFirst({
      where: {
        id: excludeEntryId ? { not: excludeEntryId } : undefined,
        active: true,
        weekday: input.weekday,
        startTime: { lt: timetableTime(input.endTime) },
        endTime: { gt: timetableTime(input.startTime) },
        AND: [
          { effectiveFrom: { lte: parseIsoDate(input.effectiveTo) } },
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: parseIsoDate(input.effectiveFrom) } },
            ],
          },
          { OR: scopeOptions },
        ],
      },
      select: {
        id: true,
        offering: { select: { batchId: true } },
      },
    });
    if (conflict) {
      if (
        selectedAssignment &&
        conflict.offering.batchId !== offering.batchId
      ) {
        throw new ConflictException(
          'The selected faculty member already has an overlapping class.',
        );
      }
      throw new ConflictException(
        'This batch already has an overlapping timetable entry.',
      );
    }
  }

  async regenerateSemester(semesterId: string, user: AuthenticatedUser) {
    const offerings = await this.prisma.subjectOffering.findMany({
      where: { batch: { semesterId } },
      select: { id: true },
    });
    for (const offering of offerings) {
      await this.regenerateOffering(
        offering.id,
        user,
        ScheduleCalculationReason.CALENDAR_CHANGE,
      );
    }
  }

  private async regenerateOffering(
    offeringId: string,
    user: AuthenticatedUser,
    reason: ScheduleCalculationReason = ScheduleCalculationReason.MANUAL_RECALCULATION,
  ) {
    const offering = await this.requireOffering(offeringId);
    const semester = offering.batch.semester;
    const desired = buildTimetableSessions({
      offeringId,
      timezone: semester.campus.timezone,
      semesterStart: formatIsoDate(semester.startDate),
      semesterEnd: formatIsoDate(semester.endDate),
      saturdayRule: semester.workingSaturdayRule,
      overrides: semester.calendarDays.map((day) => ({
        id: day.id,
        date: formatIsoDate(day.date),
        type: day.type,
        title: day.title,
        teachingAllowed: day.teachingAllowed,
        notes: day.notes,
      })),
      entries: offering.timetableEntries
        .filter((entry) => entry.active)
        .map((entry) => ({
          id: entry.id,
          weekday: entry.weekday,
          startTime: formatTimetableTime(entry.startTime),
          endTime: formatTimetableTime(entry.endTime),
          effectiveFrom: formatIsoDate(entry.effectiveFrom),
          effectiveTo: formatIsoDate(entry.effectiveTo ?? semester.endDate),
          facultyAssignmentId: entry.facultyAssignmentId,
        })),
    });
    const existing = await this.prisma.scheduledSession.findMany({
      where: { offeringId, timetableEntryId: { not: null } },
      include: { _count: { select: { logs: true } } },
    });
    const existingByKey = new Map(
      existing.map((session) => [session.sourceKey, session]),
    );
    const desiredKeys = new Set(desired.map((session) => session.sourceKey));
    let created = 0;
    let updated = 0;
    let preserved = 0;

    const removed = await this.prisma.$transaction(async (transaction) => {
      for (const session of desired) {
        const current = existingByKey.get(session.sourceKey);
        if (!current) {
          await transaction.scheduledSession.create({
            data: {
              sourceKey: session.sourceKey,
              offeringId,
              timetableEntryId: session.timetableEntryId,
              facultyAssignmentId: session.facultyAssignmentId,
              sessionDate: parseIsoDate(session.sessionDate),
              startsAt: session.startsAt,
              endsAt: session.endsAt,
            },
          });
          created += 1;
        } else if (
          current.status === ScheduledSessionStatus.SCHEDULED &&
          current._count.logs === 0
        ) {
          await transaction.scheduledSession.update({
            where: { id: current.id },
            data: {
              timetableEntryId: session.timetableEntryId,
              facultyAssignmentId: session.facultyAssignmentId,
              sessionDate: parseIsoDate(session.sessionDate),
              startsAt: session.startsAt,
              endsAt: session.endsAt,
            },
          });
          updated += 1;
        } else {
          preserved += 1;
        }
      }

      const staleIds = existing
        .filter(
          (session) =>
            !desiredKeys.has(session.sourceKey) &&
            session.status === ScheduledSessionStatus.SCHEDULED &&
            session._count.logs === 0,
        )
        .map((session) => session.id);
      if (!staleIds.length) return 0;
      const result = await transaction.scheduledSession.deleteMany({
        where: {
          id: { in: staleIds },
          status: ScheduledSessionStatus.SCHEDULED,
          logs: { none: {} },
        },
      });
      return result.count;
    });

    const plan = await this.prisma.lessonPlan.findFirst({
      where: { offeringId, status: { in: ['ACTIVE', 'DRAFT'] } },
      select: { id: true },
    });
    if (plan) await this.schedules.calculate(offeringId, { reason }, user);

    return {
      created,
      updated,
      preserved,
      removed,
      scheduledSessions: desired.length,
      semesterPlannedMinutes: desired.reduce(
        (total, session) => total + session.plannedMinutes,
        0,
      ),
    };
  }

  private requireEntry(entryId: string) {
    return this.prisma.timetableEntry
      .findUnique({ where: { id: entryId } })
      .then((entry) => {
        if (!entry) throw new NotFoundException('Timetable entry not found.');
        return entry;
      });
  }

  private requireOffering(offeringId: string) {
    return this.prisma.subjectOffering
      .findUnique({
        where: { id: offeringId },
        include: {
          subject: { select: { id: true, code: true, name: true } },
          batch: {
            include: {
              semester: {
                include: {
                  campus: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      timezone: true,
                    },
                  },
                  calendarDays: { orderBy: { date: 'asc' } },
                },
              },
            },
          },
          faculty: {
            include: {
              staffProfile: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
            orderBy: { startDate: 'asc' },
          },
          timetableEntries: {
            orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
          },
        },
      })
      .then((offering) => {
        if (!offering)
          throw new NotFoundException('Subject offering not found.');
        return offering;
      });
  }
}

function serializeEntry(entry: {
  id: string;
  facultyAssignmentId: string | null;
  weekday: number;
  startTime: Date;
  endTime: Date;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
}) {
  const startTime = formatTimetableTime(entry.startTime);
  const endTime = formatTimetableTime(entry.endTime);
  return {
    id: entry.id,
    facultyAssignmentId: entry.facultyAssignmentId,
    weekday: entry.weekday,
    startTime,
    endTime,
    plannedMinutes: durationMinutes(startTime, endTime),
    effectiveFrom: formatIsoDate(entry.effectiveFrom),
    effectiveTo: entry.effectiveTo ? formatIsoDate(entry.effectiveTo) : null,
    active: entry.active,
  };
}
