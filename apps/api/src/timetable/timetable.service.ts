import { CALENDAR_REVIEW_REASON } from '../topic-schedule/calendar-review';
import { buildAcademicCalendar } from '../academic-calendar/calendar-engine';
import { parseBatchTimetable } from './timetable-import.parser';
import { UploadedImportFile } from '../semester-import/semester-import.types';
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
        faculty: {
          where: { active: true },
          include: {
            staffProfile: { include: { user: { select: { name: true } } } },
          },
        },
        timetableEntries: {
          where: { active: true },
          include: {
            facultyAssignment: {
              select: {
                staffProfile: { select: { user: { select: { name: true } } } },
              },
            },
          },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        },
        _count: {
          select: {
            sessions: {
              where: { status: { notIn: ['CANCELLED', 'SKIPPED', 'MERGED'] } },
            },
          },
        },
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
        entries: offering.timetableEntries.map((entry) => ({
          ...serializeEntry(entry),
          facultyName:
            (entry.facultyAssignment?.staffProfile.user.name ??
              (offering.faculty ?? [])
                .filter(
                  (f) =>
                    f.startDate <= (entry.effectiveTo ?? semester.endDate) &&
                    (!f.endDate || f.endDate >= entry.effectiveFrom),
                )
                .map((f) => f.staffProfile.user.name)
                .join(', ')) ||
            null,
        })),
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
      include: { _count: { select: { logs: true } } },
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
        hasLogs: (session._count?.logs ?? 0) > 0,
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
        generatedSessions: sessions.filter(
          (s) => !['CANCELLED', 'SKIPPED', 'MERGED'].includes(s.status),
        ).length,
        semesterPlannedMinutes: sessions
          .filter(
            (session) =>
              !['CANCELLED', 'SKIPPED', 'MERGED'].includes(session.status),
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

  async moveSession(
    sessionId: string,
    input: { date: string; startTime: string; endTime: string; reason: string },
    user: AuthenticatedUser,
  ) {
    const session = await this.prisma.scheduledSession.findUnique({
      where: { id: sessionId },
      select: {
        offering: {
          select: {
            batch: { select: { semester: { select: { campusId: true } } } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Class not found.');
    this.access.assertCanManageCampus(
      user,
      session.offering.batch.semester.campusId,
    );
    return this.schedules.moveSession(sessionId, input, user);
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

  async importBatch(
    batchId: string,
    file: UploadedImportFile,
    user: AuthenticatedUser,
    commit = false,
  ) {
    const run = async (db: PrismaService | Prisma.TransactionClient) => {
      const batch = await db.batch.findUnique({
        where: { id: batchId },
        include: { semester: true },
      });
      if (!batch) throw new NotFoundException('Batch not found.');
      this.access.assertCanManageCampus(user, batch.semester.campusId);
      const parsed = await parseBatchTimetable(
        file,
        formatIsoDate(batch.semester.startDate),
        formatIsoDate(batch.semester.endDate),
      );
      const offerings = await db.subjectOffering.findMany({
        where: { batchId },
        select: { id: true, subject: { select: { name: true, code: true } } },
      });
      const rows: Array<
        CreateTimetableEntryInput & {
          source: string;
          offeringId: string;
          subject: string;
          teacher: string;
          existing: boolean;
        }
      > = [];
      const errors = [...parsed.errors];
      const key = (v: string) => v.trim().toLowerCase();
      const cache = new Map<
        string,
        Awaited<ReturnType<TimetableService['requireOffering']>>
      >();
      for (const row of parsed.rows) {
        try {
          const matches = offerings.filter(
            (o) =>
              key(o.subject.code) === key(row.subject) ||
              key(o.subject.name) === key(row.subject),
          );
          if (matches.length !== 1)
            throw new Error(
              `Subject “${row.subject}” must match one subject linked to this batch. Use its exact code.`,
            );
          const match = matches[0]!;
          let offering = cache.get(match.id);
          if (!offering) {
            offering = await this.requireOffering(match.id, db);
            cache.set(match.id, offering);
          }
          const assignments = offering.faculty.filter(
            (a) =>
              a.active &&
              a.staffProfile.active &&
              formatIsoDate(a.startDate) <= row.effectiveFrom &&
              (!a.endDate || formatIsoDate(a.endDate) >= row.effectiveTo) &&
              (!row.teacher ||
                [a.staffProfile.user.name, a.staffProfile.user.email].some(
                  (v) => key(v) === key(row.teacher),
                )),
          );
          if (assignments.length !== 1)
            throw new Error(
              row.teacher
                ? `Teacher “${row.teacher}” must match one active assignment for this subject and date range.`
                : 'Add a teacher email; this subject needs exactly one active teacher assignment covering these dates.',
            );
          const facultyAssignmentId = assignments[0]!.id;
          const input = {
            weekday: row.weekday,
            startTime: row.startTime,
            endTime: row.endTime,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            facultyAssignmentId,
          };
          const duplicate = offering.timetableEntries.find(
            (e) =>
              e.active &&
              e.weekday === row.weekday &&
              formatTimetableTime(e.startTime) === row.startTime &&
              formatTimetableTime(e.endTime) === row.endTime &&
              formatIsoDate(e.effectiveFrom) === row.effectiveFrom &&
              formatIsoDate(e.effectiveTo || batch.semester.endDate) ===
                row.effectiveTo &&
              e.facultyAssignmentId === facultyAssignmentId,
          );
          await this.validateEntry(offering, input, duplicate?.id, db);
          const overlap = rows.find(
            (r) =>
              r.weekday === row.weekday &&
              r.startTime < row.endTime &&
              r.endTime > row.startTime &&
              r.effectiveFrom <= row.effectiveTo &&
              r.effectiveTo >= row.effectiveFrom,
          );
          if (overlap)
            throw new Error(
              `Overlaps another class in this file (${overlap.source}).`,
            );
          rows.push({
            ...input,
            source: row.source,
            offeringId: match.id,
            subject: `${match.subject.code} · ${match.subject.name}`,
            teacher: assignments[0]!.staffProfile.user.name,
            existing: !!duplicate,
          });
        } catch (e) {
          errors.push({ source: row.source, message: (e as Error).message });
        }
      }
      if (commit && errors.length)
        throw new BadRequestException({
          message: 'Correct the marked timetable rows and preview again.',
          errors,
        });
      const additions = rows.filter((r) => !r.existing);
      if (commit && additions.length)
        await db.timetableEntry.createMany({
          data: additions.map((r) => ({
            offeringId: r.offeringId,
            facultyAssignmentId: r.facultyAssignmentId,
            weekday: r.weekday,
            startTime: timetableTime(r.startTime),
            endTime: timetableTime(r.endTime),
            effectiveFrom: parseIsoDate(r.effectiveFrom),
            effectiveTo: parseIsoDate(r.effectiveTo),
          })),
        });
      return {
        batch: { id: batch.id, name: batch.name },
        rows,
        errors,
        valid: !errors.length && !!rows.length,
        added: commit ? additions.length : 0,
      };
    };
    if (!commit) return run(this.prisma);
    // Re-read all matches and conflicts at commit; a preview is never authorization.
    const result = await this.prisma.$transaction((tx) => run(tx), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
    const warnings: string[] = [];
    for (const offeringId of new Set(result.rows.map((r) => r.offeringId))) {
      try {
        await this.regenerateOffering(offeringId, user);
      } catch {
        warnings.push(
          `${result.rows.find((r) => r.offeringId === offeringId)!.subject}: weekly slots saved, but class dates need a retry. Select the subject and click Update class dates.`,
        );
      }
    }
    return { ...result, warnings };
  }

  private async validateEntry(
    offering: Awaited<ReturnType<TimetableService['requireOffering']>>,
    input: CreateTimetableEntryInput,
    excludeEntryId?: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
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
    const conflict = await db.timetableEntry.findFirst({
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
      where: { offeringId },
      include: { _count: { select: { logs: true } } },
    });
    const existingByKey = new Map(
      existing.map((session) => [session.sourceKey, session]),
    );
    const desiredKeys = new Set(desired.map((session) => session.sourceKey));
    const teachingDates = new Set(
      buildAcademicCalendar({
        semesterStart: formatIsoDate(semester.startDate),
        semesterEnd: formatIsoDate(semester.endDate),
        saturdayRule: semester.workingSaturdayRule,
        overrides: semester.calendarDays.map((day) => ({
          ...day,
          date: formatIsoDate(day.date),
        })),
      })
        .days.filter((day) => day.working)
        .map((day) => day.date),
    );
    let created = 0;
    let updated = 0;
    let preserved = 0;

    const removed = await this.prisma.$transaction(
      async (transaction) => {
        const additions = desired.filter(
          (session) => !existingByKey.has(session.sourceKey),
        );
        if (additions.length) {
          const inserted = await transaction.scheduledSession.createMany({
            data: additions.map((session) => ({
              sourceKey: session.sourceKey,
              offeringId,
              timetableEntryId: session.timetableEntryId,
              facultyAssignmentId: session.facultyAssignmentId,
              sessionDate: parseIsoDate(session.sessionDate),
              startsAt: session.startsAt,
              endsAt: session.endsAt,
            })),
            skipDuplicates: true,
          });
          created = inserted.count;
        }
        for (const session of desired) {
          const current = existingByKey.get(session.sourceKey);
          if (!current) continue;
          if (
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
              (session.timetableEntryId !== null
                ? !desiredKeys.has(session.sourceKey)
                : reason === ScheduleCalculationReason.CALENDAR_CHANGE &&
                  !teachingDates.has(formatIsoDate(session.sessionDate))) &&
              session.status === ScheduledSessionStatus.SCHEDULED &&
              session._count.logs === 0,
          )
          .map((session) => session.id);
        if (!staleIds.length) return 0;
        if (reason === ScheduleCalculationReason.CALENDAR_CHANGE) {
          // Keep the original lecture so its teacher can decide how to recover it.
          // Past classes and logs remain historical facts, even after a calendar correction.
          await transaction.scheduledSession.updateMany({
            where: {
              id: { in: staleIds },
              status: ScheduledSessionStatus.SCHEDULED,
              startsAt: { gt: new Date() },
              logs: { none: {} },
            },
            data: {
              status: ScheduledSessionStatus.CANCELLED,
              cancellationReason: CALENDAR_REVIEW_REASON,
            },
          });
          return 0;
        }
        const result = await transaction.scheduledSession.deleteMany({
          where: {
            id: { in: staleIds },
            status: ScheduledSessionStatus.SCHEDULED,
            logs: { none: {} },
          },
        });
        return result.count;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

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

  private requireOffering(
    offeringId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    return db.subjectOffering
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
