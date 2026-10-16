import { TimetableService } from '../timetable/timetable.service';
import {
  AuditAction,
  ImportType,
  JobStatus,
  Prisma,
  SemesterStatus,
  SubjectOfferingStatus,
} from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseIsoDate } from '../academic-calendar/calendar-engine';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { parseAndValidateSemesterImport } from './semester-import.parser';
import {
  ImportCounts,
  ImportIssue,
  SemesterImportData,
  SemesterImportPreview,
  UploadedImportFile,
} from './semester-import.types';

@Injectable()
export class SemesterImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly timetable: TimetableService,
  ) {}

  private async checkCampus(preview: SemesterImportPreview, campusId?: string) {
    if (!campusId) return;
    const campus = await this.prisma.campus.findUnique({
      where: { id: campusId },
      select: { code: true },
    });
    if (!campus) throw new BadRequestException('Choose a valid campus.');
    if (
      [...preview.data.setupRows, ...preview.data.calendarRows].some(
        (row) => row.campusCode !== campus.code,
      )
    )
      throw new BadRequestException(
        'This file contains another campus. Use the selected campus code in your file or change campus first.',
      );
  }

  async preview(
    file: UploadedImportFile,
    user: AuthenticatedUser,
    campusId?: string,
  ) {
    this.access.assertGlobalManager(user);
    const preview = await parseAndValidateSemesterImport(file);
    await this.checkCampus(preview, campusId);
    return publicPreview(preview);
  }

  async execute(
    file: UploadedImportFile,
    user: AuthenticatedUser,
    campusId?: string,
  ) {
    this.access.assertGlobalManager(user);
    const preview = await parseAndValidateSemesterImport(file);
    await this.checkCampus(preview, campusId);
    const failedRows = Math.min(
      countFailedRows(preview.issues),
      preview.counts.rows,
    );
    const job = await this.prisma.importJob.create({
      data: {
        ...(campusId ? { campusId } : {}),
        type: ImportType.FULL_SEMESTER,
        status: preview.valid ? JobStatus.PROCESSING : JobStatus.FAILED,
        uploadedById: user.id,
        fileName: file.originalname.slice(0, 255),
        totalRows: preview.counts.rows,
        successfulRows: 0,
        failedRows,
        startedAt: new Date(),
        completedAt: preview.valid ? null : new Date(),
        errors: preview.issues.length
          ? {
              create: preview.issues.map((entry) => ({
                rowNumber: Math.max(1, entry.rowNumber),
                columnName: entry.columnName
                  ? `${entry.sheet}.${entry.columnName}`.slice(0, 160)
                  : entry.sheet.slice(0, 160),
                submittedValue: entry.submittedValue,
                errorMessage: entry.errorMessage,
              })),
            }
          : undefined,
      },
    });

    if (!preview.valid) {
      return {
        job: await this.requireJob(job.id),
        preview: publicPreview(preview),
      };
    }

    let affectedSemesters: string[] = [];
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          affectedSemesters = await this.commit(transaction, preview.data);
          await transaction.importJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.COMPLETED,
              successfulRows: preview.counts.rows,
              failedRows: 0,
              completedAt: new Date(),
            },
          });
          await transaction.auditEvent.create({
            data: {
              actorId: user.id,
              action: AuditAction.IMPORT,
              entityType: 'ImportJob',
              entityId: job.id,
              after: preview.counts,
              metadata: {
                fileName: file.originalname,
                importType: ImportType.FULL_SEMESTER,
              },
            },
          });
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The import transaction failed.';
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          failedRows: preview.counts.rows,
          completedAt: new Date(),
          errors: {
            create: {
              rowNumber: 1,
              columnName: 'Database',
              errorMessage: message,
            },
          },
        },
      });
      throw new BadRequestException(
        'The file was valid, but the database transaction could not be completed.',
      );
    }

    for (const semesterId of affectedSemesters) {
      await this.timetable.regenerateSemester(semesterId, user);
    }
    return {
      job: await this.requireJob(job.id),
      counts: preview.counts,
    };
  }

  async listJobs(user: AuthenticatedUser, campusId?: string) {
    this.access.assertGlobalManager(user);
    return this.prisma.importJob.findMany({
      where: {
        type: ImportType.FULL_SEMESTER,
        ...(campusId ? { campusId } : {}),
      },
      select: {
        id: true,
        fileName: true,
        status: true,
        totalRows: true,
        successfulRows: true,
        failedRows: true,
        createdAt: true,
        completedAt: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { errors: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async job(jobId: string, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    return this.requireJob(jobId);
  }

  async errorReport(jobId: string, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    const job = await this.requireJob(jobId);
    const header = [
      'row_number',
      'column_name',
      'submitted_value',
      'error_message',
    ];
    const rows = job.errors.map((entry) => [
      String(entry.rowNumber),
      entry.columnName ?? '',
      entry.submittedValue ?? '',
      entry.errorMessage,
    ]);
    return Buffer.from(
      [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'),
      'utf8',
    );
  }

  private requireJob(jobId: string) {
    return this.prisma.importJob
      .findUnique({
        where: { id: jobId },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
          errors: { orderBy: [{ rowNumber: 'asc' }, { columnName: 'asc' }] },
        },
      })
      .then((job) => {
        if (!job) throw new NotFoundException('Import job not found.');
        return job;
      });
  }

  private async commit(
    transaction: Prisma.TransactionClient,
    data: SemesterImportData,
  ) {
    const campuses = distinct(data.setupRows, (row) => row.campusCode);
    const campusIds = new Map<string, string>();
    for (const row of campuses) {
      const campus = await transaction.campus.upsert({
        where: { code: row.campusCode },
        create: {
          code: row.campusCode,
          name: row.campusName,
          timezone: row.campusTimezone,
          active: true,
        },
        update: {
          name: row.campusName,
          timezone: row.campusTimezone,
          active: true,
        },
        select: { id: true },
      });
      campusIds.set(row.campusCode, campus.id);
    }

    const tracks = distinct(data.setupRows, (row) => row.trackCode);
    const trackIds = new Map<string, string>();
    for (const row of tracks) {
      const track = await transaction.track.upsert({
        where: { code: row.trackCode },
        create: { code: row.trackCode, name: row.trackName, active: true },
        update: { name: row.trackName, active: true },
        select: { id: true },
      });
      trackIds.set(row.trackCode, track.id);
    }

    const semesters = distinct(
      data.setupRows,
      (row) => `${row.campusCode}\u0000${row.semesterName}`,
    );
    const semesterIds = new Map<string, string>();
    for (const row of semesters) {
      const campusId = requiredId(campusIds, row.campusCode);
      const semester = await transaction.semester.upsert({
        where: { campusId_name: { campusId, name: row.semesterName } },
        create: {
          campusId,
          name: row.semesterName,
          startDate: parseIsoDate(row.semesterStartDate),
          endDate: parseIsoDate(row.semesterEndDate),
          workingSaturdayRule: row.workingSaturdayRule,
          defaultOnTrackThreshold: row.onTrackThreshold,
          defaultTightThreshold: row.tightThreshold,
          status: SemesterStatus.DRAFT,
        },
        update: {
          startDate: parseIsoDate(row.semesterStartDate),
          endDate: parseIsoDate(row.semesterEndDate),
          workingSaturdayRule: row.workingSaturdayRule,
          defaultOnTrackThreshold: row.onTrackThreshold,
          defaultTightThreshold: row.tightThreshold,
        },
        select: { id: true },
      });
      semesterIds.set(
        `${row.campusCode}\u0000${row.semesterName}`,
        semester.id,
      );
    }

    const batches = distinct(
      data.setupRows,
      (row) =>
        `${row.campusCode}\u0000${row.semesterName}\u0000${row.batchCode}`,
    );
    const batchIds = new Map<string, string>();
    for (const row of batches) {
      const semesterKey = `${row.campusCode}\u0000${row.semesterName}`;
      const semesterId = requiredId(semesterIds, semesterKey);
      const batch = await transaction.batch.upsert({
        where: { semesterId_code: { semesterId, code: row.batchCode } },
        create: {
          semesterId,
          trackId: requiredId(trackIds, row.trackCode),
          code: row.batchCode,
          name: row.batchName,
          active: true,
        },
        update: {
          trackId: requiredId(trackIds, row.trackCode),
          name: row.batchName,
          active: true,
        },
        select: { id: true },
      });
      batchIds.set(`${semesterKey}\u0000${row.batchCode}`, batch.id);
    }

    const subjects = distinct(data.setupRows, (row) => row.subjectCode);
    const subjectIds = new Map<string, string>();
    for (const row of subjects) {
      const subject = await transaction.subject.upsert({
        where: { code: row.subjectCode },
        create: {
          code: row.subjectCode,
          name: row.subjectName,
          description: row.subjectDescription,
          active: true,
        },
        update: {
          name: row.subjectName,
          description: row.subjectDescription,
          active: true,
        },
        select: { id: true },
      });
      subjectIds.set(row.subjectCode, subject.id);
    }

    for (const row of data.setupRows) {
      const batchKey = `${row.campusCode}\u0000${row.semesterName}\u0000${row.batchCode}`;
      const batchId = requiredId(batchIds, batchKey);
      const subjectId = requiredId(subjectIds, row.subjectCode);
      await transaction.subjectOffering.upsert({
        where: { batchId_subjectId: { batchId, subjectId } },
        create: {
          batchId,
          subjectId,
          targetFinishDate: parseIsoDate(row.targetFinishDate),
          onTrackThreshold: row.onTrackThreshold,
          tightThreshold: row.tightThreshold,
          status: SubjectOfferingStatus.DRAFT,
        },
        update: {
          targetFinishDate: parseIsoDate(row.targetFinishDate),
          onTrackThreshold: row.onTrackThreshold,
          tightThreshold: row.tightThreshold,
        },
      });
    }

    for (const row of data.calendarRows) {
      const semesterId = requiredId(
        semesterIds,
        `${row.campusCode}\u0000${row.semesterName}`,
      );
      const date = parseIsoDate(row.date);
      await transaction.calendarDayOverride.upsert({
        where: { semesterId_date: { semesterId, date } },
        create: {
          semesterId,
          date,
          type: row.type,
          title: row.title,
          teachingAllowed: row.teachingAllowed,
          notes: row.notes,
        },
        update: {
          type: row.type,
          title: row.title,
          teachingAllowed: row.teachingAllowed,
          notes: row.notes,
        },
      });
    }
    return [...semesterIds.values()];
  }
}

function distinct<T>(rows: T[], keyOf: (row: T) => string) {
  return [...new Map(rows.map((row) => [keyOf(row), row])).values()];
}

function requiredId(ids: Map<string, string>, key: string) {
  const id = ids.get(key);
  if (!id) throw new Error(`Import relationship could not be resolved: ${key}`);
  return id;
}

function countFailedRows(issues: ImportIssue[]) {
  return new Set(issues.map((entry) => `${entry.sheet}:${entry.rowNumber}`))
    .size;
}

function publicPreview(preview: SemesterImportPreview) {
  return {
    valid: preview.valid,
    fileName: preview.fileName,
    counts: preview.counts,
    issues: preview.issues,
  };
}

function csvCell(value: unknown) {
  const source = String(value ?? '');
  const text = /^[=+\-@]/.test(source) ? `'${source}` : source;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export type SemesterImportResult = {
  job: unknown;
  counts?: ImportCounts;
};
