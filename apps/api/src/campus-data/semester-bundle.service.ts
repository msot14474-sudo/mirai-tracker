import { requireAcademicTrack } from '../academic-calendar/academic-tracks';
import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Prisma,
  FacultyAssignmentType,
  SessionLogStatus,
  WorkStatus,
  CalendarDayType,
  ExamType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { VisitingFacultyService } from './visiting-faculty.service';
import {
  BundleRow,
  BundleIssue,
  location,
  readBundle,
} from './semester-bundle.parser';
import { UploadedImportFile } from '../semester-import/semester-import.types';
import {
  formatIsoDate as iso,
  parseIsoDate as date,
} from '../academic-calendar/calendar-engine';
import { TimetableService } from '../timetable/timetable.service';
import { TopicScheduleService } from '../topic-schedule/topic-schedule.service';
import { topicDisplayTitle } from '../lesson-plan/topic-title';
import {
  buildTimetableSessions,
  formatTimetableTime,
  timetableTime,
  zonedDateTimeToUtc,
} from '../timetable/timetable-engine';

class PreviewRollback extends Error {}
class RowFailure extends Error {
  constructor(
    readonly row: BundleRow,
    message: string,
  ) {
    super(message);
  }
}
const keyOf = (v: Record<string, string>) =>
  `${v.batch_code}|${v.subject_code}`;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
type Tx = Prisma.TransactionClient;

@Injectable()
export class SemesterBundleService {
  constructor(
    private readonly db: PrismaService,
    private readonly visiting: VisitingFacultyService,
    private readonly timetable: TimetableService,
    private readonly schedules: TopicScheduleService,
  ) {}

  async inspect(
    semesterId: string,
    files: UploadedImportFile[],
    user: AuthenticatedUser,
    commit = false,
    expectedFingerprint?: string,
  ) {
    const semester = await this.visiting.semester(semesterId, user);
    const parsed = await readBundle(files, {
      start: iso(semester.startDate),
      end: iso(semester.endDate),
      campusCode: semester.campus.code,
      semesterName: semester.name,
    });
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify(
          parsed.rows.map((r) => ({
            dataset: r.dataset,
            values: r.values,
            original: r.original,
          })),
        ),
      )
      .digest('hex');
    if (commit && expectedFingerprint !== fingerprint)
      throw new BadRequestException(
        'Files changed after preview. Preview them again before importing.',
      );
    const prior = await this.db.semesterDataImport.findUnique({
      where: { semesterId_fingerprint: { semesterId, fingerprint } },
    });
    const response = {
      valid: !parsed.issues.length,
      counts: parsed.counts,
      issues: parsed.issues,
      warnings: parsed.warnings,
      skippedSheets: parsed.skippedSheets,
      fingerprint,
      alreadyImported: !!prior,
      rows: parsed.rows.map((r) => ({
        dataset: r.dataset,
        location: location(r),
        values: r.values,
      })),
      importId: prior?.id,
    };
    if (prior) return response;
    if (parsed.issues.length) return response;
    let importId: string | undefined;
    const offerings = new Set<string>();
    try {
      await this.db.$transaction(
        async (tx) => {
          // Check inside the transaction so retries cannot duplicate a completed import.
          const existing = await tx.semesterDataImport.findUnique({
            where: { semesterId_fingerprint: { semesterId, fingerprint } },
          });
          if (existing) {
            importId = existing.id;
            return;
          }
          await this.apply(tx, semester, parsed.rows, user, offerings);
          if (!commit) throw new PreviewRollback();
          const saved = await tx.semesterDataImport.create({
            data: {
              semesterId,
              fingerprint,
              uploadedById: user.id,
              fileNames: files.map((f) => f.originalname).join(', '),
              sourceData: parsed.rows as unknown as Prisma.InputJsonValue,
              counts: parsed.counts,
            },
          });
          importId = saved.id;
          await tx.auditEvent.create({
            data: {
              actorId: user.id,
              campusId: semester.campusId,
              action: 'IMPORT',
              entityType: 'SemesterDataImport',
              entityId: saved.id,
              after: parsed.counts,
              metadata: { semesterId, fingerprint },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 60000,
          maxWait: 10000,
        },
      );
    } catch (error) {
      if (error instanceof PreviewRollback) return response;
      const issue: BundleIssue =
        error instanceof RowFailure
          ? { location: location(error.row), message: error.message }
          : {
              location: 'Import',
              message:
                error instanceof Prisma.PrismaClientKnownRequestError &&
                ['P2034', 'P2002'].includes(error.code)
                  ? 'Data changed while this file was being checked. Preview the files again before importing.'
                  : 'The import could not be completed. No records were changed. Check linked records and try again.',
            };
      return { ...response, valid: false, issues: [...response.issues, issue] };
    }
    if (commit) {
      // These existing services preserve taught history and recalculate remaining topic dates.
      try {
        await this.timetable.regenerateSemester(semesterId, user);
      } catch {
        response.warnings.push({
          location: 'Saved',
          message:
            'Records were saved, but class-date recalculation needs a retry in Timetable.',
        });
      }
      for (const id of offerings) {
        try {
          const plan = await this.db.lessonPlan.findFirst({
            where: { offeringId: id, status: { in: ['DRAFT', 'ACTIVE'] } },
          });
          if (plan)
            await this.schedules.calculate(
              id,
              { reason: 'MANUAL_RECALCULATION' },
              user,
            );
        } catch {
          response.warnings.push({
            location: 'Saved',
            message: 'A lesson plan needs recalculation in Planned dates.',
          });
        }
      }
    }
    return { ...response, importId };
  }

  async history(semesterId: string, user: AuthenticatedUser) {
    await this.visiting.semester(semesterId, user);
    return this.db.semesterDataImport.findMany({
      where: { semesterId },
      select: { id: true, fileNames: true, counts: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
  async source(semesterId: string, id: string, user: AuthenticatedUser) {
    await this.visiting.semester(semesterId, user);
    const item = await this.db.semesterDataImport.findFirst({
      where: { id, semesterId },
    });
    if (!item)
      throw new BadRequestException('Import not found in this semester.');
    return item;
  }

  private async apply(
    tx: Tx,
    semester: Awaited<ReturnType<VisitingFacultyService['semester']>>,
    rows: BundleRow[],
    user: AuthenticatedUser,
    affected: Set<string>,
  ) {
    const fail = (row: BundleRow, message: string): never => {
      throw new RowFailure(row, message);
    };
    const each = async (
      dataset: BundleRow['dataset'],
      work: (r: BundleRow) => Promise<void>,
    ) => {
      for (const row of rows.filter((r) => r.dataset === dataset)) {
        try {
          await work(row);
        } catch (e) {
          if (e instanceof RowFailure) throw e;
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2034'
          )
            throw e;
          fail(
            row,
            e instanceof Prisma.PrismaClientKnownRequestError
              ? 'This row conflicts with an existing record. Check its code, date and linked records.'
              : e instanceof Error
                ? e.message
                : 'Invalid row.',
          );
        }
      }
    };
    const offering = async (r: BundleRow) => {
      const v = r.values;
      const found = await tx.subjectOffering.findFirst({
        where: {
          batch: { semesterId: semester.id, code: v.batch_code },
          subject: { code: v.subject_code },
        },
        include: { batch: true, subject: true },
      });
      if (!found)
        fail(
          r,
          `Link ${v.subject_code} to batch ${v.batch_code} first, or include it in Subjects.`,
        );
      affected.add(found!.id);
      return found!;
    };
    const teacher = async (r: BundleRow) => {
      const staff = await tx.staffProfile.findFirst({
        where: {
          active: true,
          user: {
            email: r.values.faculty_email,
            status: 'ACTIVE',
            roleAssignments: {
              some: { role: 'FACULTY', campusId: semester.campusId },
            },
          },
        },
        include: { user: true },
      });
      if (!staff)
        fail(
          r,
          `Give ${r.values.faculty_email} faculty access in ${semester.campus.name} first. File imports do not grant login access.`,
        );
      return staff!;
    };
    const assignment = async (
      r: BundleRow,
      offeringId: string,
      from: string,
      to = from,
    ) => {
      if (!r.values.faculty_email) return null;
      const staff = await teacher(r);
      const matches = await tx.facultyAssignment.findMany({
        where: {
          offeringId,
          staffProfileId: staff.id,
          active: true,
          startDate: { lte: date(from) },
          OR: [{ endDate: null }, { endDate: { gte: date(to) } }],
        },
      });
      if (matches.length !== 1)
        fail(
          r,
          'Faculty assignment must uniquely cover these class dates. Include or correct the Faculty sheet.',
        );
      return matches[0]!;
    };
    await each('Subjects', async (r) => {
      const v = r.values;
      const selectedTrack = requireAcademicTrack(v.track_code, v.track_name);
      let track = await tx.track.findUnique({
        where: { code: selectedTrack.code },
      });
      if (track && !track.active) fail(r, 'This track is inactive.');
      track ??= await tx.track.create({
        data: { code: selectedTrack.code, name: selectedTrack.name },
      });
      let batch = await tx.batch.findUnique({
        where: {
          semesterId_code: { semesterId: semester.id, code: v.batch_code! },
        },
      });
      if (batch && batch.name !== v.batch_name)
        fail(
          r,
          'Batch already has a different name. Correct the file to match.',
        );
      batch ??= await tx.batch.create({
        data: {
          semesterId: semester.id,
          trackId: track.id,
          code: v.batch_code!,
          name: v.batch_name!,
        },
      });
      let subject = await tx.subject.findUnique({
        where: { code: v.subject_code },
        include: {
          offerings: {
            select: {
              batch: { select: { semester: { select: { campusId: true } } } },
            },
          },
        },
      });
      if (
        subject &&
        ((subject.campusId && subject.campusId !== semester.campusId) ||
          subject.offerings.some(
            (o) => o.batch.semester.campusId !== semester.campusId,
          ))
      )
        fail(
          r,
          'Subject code belongs to another campus. Use this campus’s subject code.',
        );
      if (subject && subject.name !== v.subject_name)
        fail(
          r,
          'Subject code already has a different name. Correct the file to match.',
        );
      if (!subject)
        subject = await tx.subject.create({
          data: {
            campusId: semester.campusId,
            code: v.subject_code!,
            name: v.subject_name!,
            description: v.description || null,
          },
          include: {
            offerings: {
              select: {
                batch: { select: { semester: { select: { campusId: true } } } },
              },
            },
          },
        });
      const found = await tx.subjectOffering.upsert({
        where: {
          batchId_subjectId: { batchId: batch.id, subjectId: subject.id },
        },
        create: {
          batchId: batch.id,
          subjectId: subject.id,
          academicTrack: selectedTrack.code,
          targetFinishDate: date(v.target_finish_date!),
          status: 'ACTIVE',
        },
        update: { academicTrack: selectedTrack.code },
      });
      affected.add(found.id);
    });
    await each('Faculty', async (r) => {
      const v = r.values,
        off = await offering(r),
        staff = await teacher(r),
        startDate = date(v.start_date!);
      const existing = await tx.facultyAssignment.findUnique({
        where: {
          offeringId_staffProfileId_startDate: {
            offeringId: off.id,
            staffProfileId: staff.id,
            startDate,
          },
        },
      });
      if (existing) {
        if (
          existing.type !== v.assignment_type ||
          iso(existing.endDate ?? semester.endDate) !== v.end_date ||
          !existing.active
        )
          fail(
            r,
            'This assignment already exists with different dates or status. Update it in User access.',
          );
      } else
        await tx.facultyAssignment.create({
          data: {
            offeringId: off.id,
            staffProfileId: staff.id,
            startDate,
            endDate: date(v.end_date!),
            type: v.assignment_type as FacultyAssignmentType,
          },
        });
    });
    const importedDays = new Map<string, string>();
    await each('Calendar', async (r) => {
      const v = r.values,
        end = date(v.end_date || v.date!);
      for (
        let d = date(v.date!);
        d <= end;
        d = new Date(d.getTime() + 86400000)
      ) {
        const data = {
          type: v.type as CalendarDayType,
          title: v.title!,
          teachingAllowed:
            v.type === 'EXTRA_WORKING_DAY' ||
            (v.type === 'EVENT' &&
              /^(true|yes|1)$/i.test(v.teaching_allowed ?? '')),
          notes: v.notes || null,
        };
        const signature = JSON.stringify(data),
          prior = importedDays.get(iso(d));
        if (prior && prior !== signature)
          fail(
            r,
            `Conflicting calendar entries for ${iso(d)}. Keep one agreed update for this date.`,
          );
        importedDays.set(iso(d), signature);
        await tx.calendarDayOverride.upsert({
          where: { semesterId_date: { semesterId: semester.id, date: d } },
          create: { ...data, semesterId: semester.id, date: d },
          update: data,
        });
      }
    });
    await each('Exams', async (r) => {
      const v = r.values,
        data = {
          type: v.type as ExamType,
          startDate: date(v.start_date!),
          endDate: date(v.end_date!),
          syllabusDeadline: date(v.syllabus_deadline!),
        };
      await tx.examWindow.upsert({
        where: {
          semesterId_name: { semesterId: semester.id, name: v.exam_name! },
        },
        create: { ...data, semesterId: semester.id, name: v.exam_name! },
        update: data,
      });
    });
    const newEntries: string[] = [];
    await each('Timetable', async (r) => {
      const v = r.values,
        off = await offering(r),
        a = await assignment(r, off.id, v.effective_from!, v.effective_to!);
      const natural = {
        offeringId: off.id,
        weekday: +v.weekday!,
        startTime: timetableTime(v.start_time!),
        effectiveFrom: date(v.effective_from!),
      };
      const existing = await tx.timetableEntry.findUnique({
        where: { offeringId_weekday_startTime_effectiveFrom: natural },
      });
      if (existing) {
        if (
          formatTimetableTime(existing.endTime) !== v.end_time ||
          iso(existing.effectiveTo ?? semester.endDate) !== v.effective_to ||
          existing.facultyAssignmentId !== (a?.id ?? null) ||
          !existing.active
        )
          fail(
            r,
            'A weekly class already exists at this time with different details. Edit it in Timetable.',
          );
        return;
      }
      const conflict = await tx.timetableEntry.findFirst({
        where: {
          active: true,
          weekday: +v.weekday!,
          startTime: { lt: timetableTime(v.end_time!) },
          endTime: { gt: timetableTime(v.start_time!) },
          effectiveFrom: { lte: date(v.effective_to!) },
          AND: [
            {
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: date(v.effective_from!) } },
              ],
            },
            {
              OR: [
                { offering: { batchId: off.batchId } },
                ...(a
                  ? [
                      {
                        facultyAssignment: { staffProfileId: a.staffProfileId },
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
      });
      if (conflict)
        fail(
          r,
          'This weekly class overlaps another class for the batch or teacher.',
        );
      const entry = await tx.timetableEntry.create({
        data: {
          ...natural,
          facultyAssignmentId: a?.id,
          endTime: timetableTime(v.end_time!),
          effectiveTo: date(v.effective_to!),
        },
      });
      newEntries.push(entry.id);
    });
    // Generate new weekly dates inside the same transaction so imported logs can link to them.
    const calendarDays = await tx.calendarDayOverride.findMany({
      where: { semesterId: semester.id },
    });
    for (const entry of await tx.timetableEntry.findMany({
      where: { id: { in: newEntries } },
      include: { offering: true },
    })) {
      const planned = buildTimetableSessions({
        offeringId: entry.offeringId,
        timezone: semester.campus.timezone,
        semesterStart: iso(semester.startDate),
        semesterEnd: iso(semester.endDate),
        saturdayRule: semester.workingSaturdayRule,
        overrides: calendarDays.map((d) => ({ ...d, date: iso(d.date) })),
        entries: [
          {
            id: entry.id,
            weekday: entry.weekday,
            startTime: formatTimetableTime(entry.startTime),
            endTime: formatTimetableTime(entry.endTime),
            effectiveFrom: iso(entry.effectiveFrom),
            effectiveTo: iso(entry.effectiveTo ?? semester.endDate),
            facultyAssignmentId: entry.facultyAssignmentId,
          },
        ],
      });
      if (planned.length)
        await tx.scheduledSession.createMany({
          data: planned.map(({ plannedMinutes, ...s }) => ({
            ...s,
            offeringId: entry.offeringId,
            sessionDate: date(s.sessionDate),
          })),
          skipDuplicates: true,
        });
    }
    await each('Lessons', async (r) => {
      const v = r.values,
        off = await offering(r);
      let plan =
        (await tx.lessonPlan.findFirst({
          where: { offeringId: off.id, status: 'ACTIVE' },
          orderBy: { version: 'desc' },
        })) ??
        (await tx.lessonPlan.findFirst({
          where: { offeringId: off.id, status: 'DRAFT' },
          orderBy: { version: 'desc' },
        }));
      if (!plan) {
        const previous = await tx.lessonPlan.aggregate({
          where: { offeringId: off.id },
          _max: { version: true },
        });
        plan = await tx.lessonPlan.create({
          data: {
            offeringId: off.id,
            version: (previous._max.version ?? 0) + 1,
            status: 'ACTIVE',
            uploadedById: user.id,
            fileName: r.file,
          },
        });
      }
      let unit = await tx.unit.findUnique({
        where: {
          lessonPlanId_sequence: {
            lessonPlanId: plan.id,
            sequence: +v.unit_sequence!,
          },
        },
      });
      if (unit && unit.title !== v.unit_title)
        fail(
          r,
          'Unit sequence already has a different title. Use the existing unit sequence or append a new one.',
        );
      unit ??= await tx.unit.create({
        data: {
          lessonPlanId: plan.id,
          sequence: +v.unit_sequence!,
          title: v.unit_title!,
        },
      });
      let topic = await tx.topic.findUnique({
        where: {
          unitId_sequence: { unitId: unit.id, sequence: +v.topic_sequence! },
        },
        include: { _count: { select: { sessionUpdates: true } } },
      });
      const completion = +v.completion_percentage!;
      const data = {
        title: topicDisplayTitle(v.topic_title!, v.unit_title!),
        plannedMinutes: Math.round(+v.planned_hours! * 60),
        description: v.notes || null,
        currentCompletionPercentage: completion,
        status:
          completion >= 100
            ? ('COMPLETED' as const)
            : completion > 0
              ? ('IN_PROGRESS' as const)
              : ('NOT_STARTED' as const),
      };
      if (topic) {
        if (
          topic.title !== data.title ||
          topic.plannedMinutes !== data.plannedMinutes
        )
          fail(
            r,
            'Topic sequence already has different content. Edit it in Lesson plans or append a new topic.',
          );
        if (completion > Number(topic.currentCompletionPercentage)) {
          if (topic._count.sessionUpdates)
            fail(
              r,
              'This topic has recorded class history. Update completion through its class log.',
            );
          await tx.topic.update({
            where: { id: topic.id },
            data: {
              currentCompletionPercentage: completion,
              status: data.status,
            },
          });
        }
      } else
        topic = await tx.topic.create({
          data: { ...data, unitId: unit.id, sequence: +v.topic_sequence! },
          include: { _count: { select: { sessionUpdates: true } } },
        });
      for (const name of (v.exam_names ?? '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)) {
        const exam = await tx.examWindow.findUnique({
          where: { semesterId_name: { semesterId: semester.id, name } },
        });
        if (!exam)
          fail(r, `Exam "${name}" was not found. Include it in Exams.`);
        await tx.examScope.upsert({
          where: {
            examWindowId_topicId: { examWindowId: exam!.id, topicId: topic.id },
          },
          create: { examWindowId: exam!.id, topicId: topic.id },
          update: {},
        });
      }
    });
    // Create/resolve all dated records first, allowing merge targets later in the same file.
    const sessionIds = new Map<BundleRow, string>();
    await each('Sessions', async (r) => {
      const v = r.values,
        off = await offering(r),
        a = await assignment(r, off.id, v.date!);
      const startsAt = zonedDateTimeToUtc(
          v.date!,
          v.start_time!,
          semester.campus.timezone,
        ),
        endsAt = zonedDateTimeToUtc(
          v.date!,
          v.end_time!,
          semester.campus.timezone,
        );
      if (endsAt > new Date())
        fail(r, 'Actual class logs cannot be dated in the future.');
      const candidates = await tx.scheduledSession.findMany({
        where: { offeringId: off.id, sessionDate: date(v.date!), startsAt },
      });
      if (candidates.length > 1)
        fail(
          r,
          'More than one class matches this time. Resolve the duplicate in Timetable.',
        );
      let session = candidates[0];
      if (
        session &&
        (session.endsAt.getTime() !== endsAt.getTime() ||
          (session.facultyAssignmentId &&
            session.facultyAssignmentId !== a!.id))
      )
        fail(
          r,
          'Recorded time or teacher differs from the scheduled class. Correct the timetable or file.',
        );
      if (!session) {
        const conflict = await tx.scheduledSession.findFirst({
          where: {
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            status: { notIn: ['CANCELLED', 'SKIPPED', 'MERGED'] },
            OR: [
              { offering: { batchId: off.batchId } },
              { facultyAssignment: { staffProfileId: a!.staffProfileId } },
            ],
          },
        });
        if (conflict)
          fail(r, 'Recorded class overlaps another batch or teacher session.');
        session = await tx.scheduledSession.create({
          data: {
            offeringId: off.id,
            facultyAssignmentId: a!.id,
            sessionDate: date(v.date!),
            startsAt,
            endsAt,
            isExtraSession: true,
            sourceKey: `import:${off.id}:${v.date}:${v.start_time}`,
          },
        });
      } else if (!session.facultyAssignmentId)
        await tx.scheduledSession.update({
          where: { id: session.id },
          data: { facultyAssignmentId: a!.id },
        });
      sessionIds.set(r, session.id);
    });
    await each('Sessions', async (r) => {
      const v = r.values,
        id = sessionIds.get(r)!,
        off = await offering(r);
      const latest = await tx.sessionLog.findFirst({
        where: { scheduledSessionId: id },
        orderBy: { revision: 'desc' },
      });
      if (latest) {
        if (
          latest.status !== v.status ||
          Number(latest.overallCompletionPercentage) !==
            +v.completion_percentage! ||
          latest.coveredSummary !== v.covered ||
          (latest.leftOverSummary || '') !== (v.left_over || '') ||
          latest.classworkStatus !== (v.classwork_status || 'NOT_APPLICABLE') ||
          latest.homeworkStatus !== (v.homework_status || 'NOT_APPLICABLE') ||
          latest.notes !==
            [
              v.notes,
              `Imported teaching record for ${v.faculty_email} by ${user.name}.`,
            ]
              .filter(Boolean)
              .join('\n')
        )
          fail(
            r,
            'A different log already exists for this class. Update the existing log instead of replacing its history.',
          );
        return;
      }
      let mergedIntoSessionId: string | null = null;
      if (v.status === 'MERGED') {
        const target = await tx.scheduledSession.findFirst({
          where: {
            offeringId: off.id,
            sessionDate: date(v.merged_to_date!),
            startsAt: zonedDateTimeToUtc(
              v.merged_to_date!,
              v.merged_to_start_time!,
              semester.campus.timezone,
            ),
          },
        });
        if (
          !target ||
          target.id === id ||
          ['CANCELLED', 'SKIPPED', 'MERGED'].includes(target.status)
        )
          fail(
            r,
            'Choose an existing, usable different class as the merge target.',
          );
        if (
          rows.some(
            (other) =>
              other.dataset === 'Sessions' &&
              sessionIds.get(other) === target!.id &&
              other.values.status === 'MERGED',
          )
        )
          fail(r, 'A merge target cannot itself be merged into another class.');
        mergedIntoSessionId = target!.id;
      }
      const log = await tx.sessionLog.create({
        data: {
          scheduledSessionId: id,
          revision: 1,
          status: v.status as SessionLogStatus,
          overallCompletionPercentage: +v.completion_percentage!,
          coveredSummary: v.covered!,
          leftOverSummary: v.left_over || null,
          classworkStatus: (v.classwork_status ||
            'NOT_APPLICABLE') as WorkStatus,
          homeworkStatus: (v.homework_status || 'NOT_APPLICABLE') as WorkStatus,
          notes: [
            v.notes,
            `Imported teaching record for ${v.faculty_email} by ${user.name}.`,
          ]
            .filter(Boolean)
            .join('\n'),
          loggedById: user.id,
        },
      });
      await tx.scheduledSession.update({
        where: { id },
        data: {
          status: v.status as SessionLogStatus,
          mergedIntoSessionId,
          cancellationReason:
            v.status === 'CANCELLED' ? v.notes || v.covered : null,
        },
      });
      if (
        v.unit_sequence ||
        v.topic_sequence ||
        v.topic_completion_percentage
      ) {
        if (
          !v.unit_sequence ||
          !v.topic_sequence ||
          !v.topic_completion_percentage
        )
          fail(
            r,
            'Provide unit_sequence, topic_sequence and topic_completion_percentage together.',
          );
        if (!['COMPLETED', 'IN_PROGRESS'].includes(v.status!))
          fail(
            r,
            'Skipped, merged and cancelled classes cannot advance a topic.',
          );
        const topic = await tx.topic.findFirst({
          where: {
            sequence: +v.topic_sequence!,
            unit: {
              sequence: +v.unit_sequence!,
              lessonPlan: {
                offeringId: off.id,
                status: { in: ['ACTIVE', 'DRAFT'] },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!topic)
          fail(r, 'Topic for this session was not found in the lesson plan.');
        const after = +v.topic_completion_percentage!,
          before = Number(topic!.currentCompletionPercentage);
        if (after < before)
          fail(
            r,
            'Imported topic completion cannot reduce existing progress. Correct the file or use a log correction.',
          );
        await tx.sessionTopicUpdate.create({
          data: {
            sessionLogId: log.id,
            topicId: topic!.id,
            completionBeforePercentage: before,
            completionAfterPercentage: after,
          },
        });
        await tx.topic.update({
          where: { id: topic!.id },
          data: {
            currentCompletionPercentage: after,
            status:
              after >= 100
                ? 'COMPLETED'
                : after > 0
                  ? 'IN_PROGRESS'
                  : 'NOT_STARTED',
          },
        });
      }
    });
    const visitingTeacher = async (r: BundleRow) => {
      const s = await teacher(r);
      if (
        s.staffType !== 'VISITING' &&
        !(await tx.facultyAssignment.findFirst({
          where: {
            staffProfileId: s.id,
            type: 'VISITING',
            offering: { batch: { semesterId: semester.id } },
          },
        }))
      )
        fail(r, 'This teacher is not marked as visiting faculty.');
      return s;
    };
    await each('Rates', async (r) => {
      const v = r.values,
        s = await visitingTeacher(r),
        key = {
          campusId: semester.campusId,
          staffProfileId: s.id,
          effectiveFrom: date(v.effective_from!),
        };
      const old = await tx.visitingFacultyRate.findUnique({
        where: { campusId_staffProfileId_effectiveFrom: key },
      });
      if (old && Number(old.ratePerClass) !== +v.rate_per_class!)
        fail(
          r,
          'A different rate already exists on this date. Correct it in Visiting faculty.',
        );
      if (!old)
        await tx.visitingFacultyRate.create({
          data: { ...key, ratePerClass: +v.rate_per_class! },
        });
    });
    for (const kind of ['Expenses', 'Payments'] as const)
      await each(kind, async (r) => {
        const v = r.values,
          s = await visitingTeacher(r),
          reference = `${kind}:${v.reference}`;
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: semester.campus.timezone,
        }).format(new Date());
        if (v.date! > today)
          fail(
            r,
            'Expenses and payments must use their actual date, not a future date.',
          );
        const data = {
          semesterId: semester.id,
          staffProfileId: s.id,
          date: date(v.date!),
          kind: kind === 'Expenses' ? 'EXPENSE' : 'PAYMENT',
          category: v.category || (kind === 'Payments' ? 'Payment' : 'Other'),
          amount: +v.amount!,
          notes: v.notes || '',
          reference,
        };
        const old = await tx.visitingFacultyLedger.findUnique({
          where: {
            semesterId_reference: { semesterId: semester.id, reference },
          },
        });
        if (
          old &&
          !equal(
            [
              old.staffProfileId,
              iso(old.date),
              Number(old.amount),
              old.notes,
              old.category,
              old.voided,
            ],
            [
              data.staffProfileId,
              v.date,
              data.amount,
              data.notes,
              data.category,
              false,
            ],
          )
        )
          fail(
            r,
            'This expense/payment reference already exists with different details. Use its original record or a new reference.',
          );
        if (!old) await tx.visitingFacultyLedger.create({ data });
      });
  }
}
