import {
  AuditAction,
  ExportType,
  FacultyAssignmentType,
  JobStatus,
  SessionLogStatus,
  StaffType,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { buildCsv, csvBuffer } from './export-csv';
import { ExportRequest } from './export.schemas';

type ProgressSubject = Awaited<
  ReturnType<ProgressService['list']>
>['subjects'][number];
type FullDataRow = { dataset: string; recordId: string; data: string };

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
    private readonly progress: ProgressService,
  ) {}

  async history(user: AuthenticatedUser, campusId?: string) {
    this.access.assertGlobalManager(user);
    return this.prisma.exportJob.findMany({
      ...(campusId ? { where: { campusId } } : {}),
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async generate(request: ExportRequest, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);
    const job = await this.prisma.exportJob.create({
      data: {
        type: request.type,
        requestedById: user.id,
        ...(request.campusId ? { campusId: request.campusId } : {}),
      },
    });

    try {
      const generated = await this.build(request, user);
      const completedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.exportJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            storageKey: generated.filename,
            completedAt,
            errorMessage: null,
          },
        }),
        this.prisma.auditEvent.create({
          data: {
            actorId: user.id,
            action: AuditAction.EXPORT,
            entityType: 'ExportJob',
            entityId: job.id,
            after: {
              type: request.type,
              status: JobStatus.COMPLETED,
              filename: generated.filename,
            },
            metadata: request,
          },
        }),
      ]);
      return {
        ...generated,
        jobId: job.id,
        completedAt,
      };
    } catch (error) {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : 'Export failed.',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async build(request: ExportRequest, user: AuthenticatedUser) {
    switch (request.type) {
      case ExportType.CAMPUS_PROGRESS:
        return this.campusProgress(request.asOf, user, request.campusId);
      case ExportType.SUBJECT_PROGRESS:
        return this.subjectProgress(request.asOf, user, request.campusId);
      case ExportType.VISITING_FACULTY_HONORARIUM:
        return this.visitingFaculty(
          request.month,
          request.ratePerLecture,
          request.campusId,
        );
      case ExportType.FULL_DATA:
        return this.fullData(request.campusId);
    }
  }

  private async campusProgress(
    asOf: string,
    user: AuthenticatedUser,
    campusId?: string,
  ) {
    const dashboard = await this.progress.dashboard(asOf, user, campusId);
    const csv = buildCsv(dashboard.campuses, [
      { header: 'as_of_date', value: () => asOf },
      { header: 'campus_code', value: (row) => row.code },
      { header: 'campus_name', value: (row) => row.name },
      { header: 'subject_count', value: (row) => row.subjectCount },
      { header: 'hours_in_scope', value: (row) => row.hoursInScope },
      { header: 'covered_hours', value: (row) => row.coveredHours },
      { header: 'coverage_percentage', value: (row) => row.coveragePercentage },
      { header: 'remaining_hours', value: (row) => row.remainingHours },
      { header: 'available_hours', value: (row) => row.availableHours },
      {
        header: 'planned_hours_by_today',
        value: (row) => row.plannedHoursByToday,
      },
      { header: 'pace_vs_plan_hours', value: (row) => row.paceVsPlanHours },
      { header: 'buffer_ratio', value: (row) => row.bufferRatio },
      { header: 'overdue_topics', value: (row) => row.overdueTopics },
      {
        header: 'on_track_subjects',
        value: (row) => row.statusCounts.ON_TRACK,
      },
      { header: 'tight_subjects', value: (row) => row.statusCounts.TIGHT },
      { header: 'danger_subjects', value: (row) => row.statusCounts.DANGER },
      {
        header: 'complete_subjects',
        value: (row) => row.statusCounts.COMPLETE,
      },
      { header: 'status', value: (row) => row.status },
    ]);
    return report(`mirai-campus-progress-${asOf}.csv`, csv);
  }

  private async subjectProgress(
    asOf: string,
    user: AuthenticatedUser,
    campusId?: string,
  ) {
    const { subjects } = await this.progress.list(asOf, user, campusId);
    const csv = buildCsv(subjects, subjectProgressColumns(asOf));
    return report(`mirai-subject-progress-${asOf}.csv`, csv);
  }

  private async visitingFaculty(
    month: string,
    ratePerLecture: number,
    campusId?: string,
  ) {
    const { start, end } = monthRange(month);
    const sessions = await this.prisma.scheduledSession.findMany({
      where: {
        sessionDate: { gte: start, lt: end },
        ...(campusId
          ? { offering: { batch: { semester: { campusId } } } }
          : {}),
        facultyAssignment: {
          is: {
            OR: [
              { type: FacultyAssignmentType.VISITING },
              { staffProfile: { staffType: StaffType.VISITING } },
            ],
          },
        },
      },
      include: {
        facultyAssignment: {
          include: {
            staffProfile: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        offering: {
          include: {
            subject: { select: { code: true, name: true } },
            batch: {
              include: {
                track: { select: { code: true, name: true } },
                semester: {
                  include: { campus: { select: { code: true, name: true } } },
                },
              },
            },
          },
        },
        logs: {
          orderBy: { revision: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
      orderBy: [{ sessionDate: 'asc' }, { startsAt: 'asc' }],
    });

    const grouped = new Map<string, HonorariumRow>();
    for (const session of sessions) {
      const assignment = session.facultyAssignment!;
      const staff = assignment.staffProfile;
      const key = `${staff.id}:${session.offeringId}`;
      const row = grouped.get(key) ?? {
        month,
        campusCode: session.offering.batch.semester.campus.code,
        campusName: session.offering.batch.semester.campus.name,
        trackCode: session.offering.batch.track.code,
        batchCode: session.offering.batch.code,
        subjectCode: session.offering.subject.code,
        subjectName: session.offering.subject.name,
        facultyName: staff.user.name,
        facultyEmail: staff.user.email,
        employeeCode: staff.employeeCode,
        plannedLectures: 0,
        takenLectures: 0,
        takenMinutes: 0,
        ratePerLecture,
        honorariumAmount: 0,
      };
      row.plannedLectures += 1;
      const latestStatus = session.logs[0]?.status;
      if (
        latestStatus === SessionLogStatus.COMPLETED ||
        latestStatus === SessionLogStatus.IN_PROGRESS
      ) {
        row.takenLectures += 1;
        row.takenMinutes += Math.max(
          0,
          Math.round(
            (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000,
          ),
        );
      }
      row.honorariumAmount = row.takenLectures * ratePerLecture;
      grouped.set(key, row);
    }

    const rows = [...grouped.values()].sort(
      (left, right) =>
        left.campusName.localeCompare(right.campusName) ||
        left.facultyName.localeCompare(right.facultyName) ||
        left.subjectCode.localeCompare(right.subjectCode),
    );
    const csv = buildCsv(rows, honorariumColumns);
    return report(`mirai-visiting-faculty-${month}.csv`, csv);
  }

  private async fullData(campusId?: string) {
    const datasets = await Promise.all([
      dataset(
        'users',
        this.prisma.user.findMany({
          ...(campusId
            ? { where: { roleAssignments: { some: { campusId } } } }
            : {}),
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ),
      dataset(
        'role_assignments',
        this.prisma.roleAssignment.findMany({
          where: campusId ? { campusId } : {},
        }),
      ),
      dataset(
        'staff_profiles',
        this.prisma.staffProfile.findMany({
          where: campusId
            ? { user: { roleAssignments: { some: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'student_profiles',
        this.prisma.studentProfile.findMany({
          where: campusId ? { batch: { semester: { campusId } } } : {},
        }),
      ),
      dataset(
        'campuses',
        this.prisma.campus.findMany({
          where: campusId ? { id: campusId } : {},
        }),
      ),
      dataset(
        'tracks',
        this.prisma.track.findMany({
          where: campusId
            ? { batches: { some: { semester: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'semesters',
        this.prisma.semester.findMany({ where: campusId ? { campusId } : {} }),
      ),
      dataset(
        'calendar_days',
        this.prisma.calendarDayOverride.findMany({
          where: campusId ? { semester: { campusId } } : {},
        }),
      ),
      dataset(
        'exam_windows',
        this.prisma.examWindow.findMany({
          where: campusId ? { semester: { campusId } } : {},
        }),
      ),
      dataset(
        'batches',
        this.prisma.batch.findMany({
          where: campusId ? { semester: { campusId } } : {},
        }),
      ),
      dataset(
        'subjects',
        this.prisma.subject.findMany({
          where: campusId
            ? {
                OR: [
                  { campusId },
                  {
                    offerings: { some: { batch: { semester: { campusId } } } },
                  },
                ],
              }
            : {},
        }),
      ),
      dataset(
        'subject_offerings',
        this.prisma.subjectOffering.findMany({
          where: campusId ? { batch: { semester: { campusId } } } : {},
        }),
      ),
      dataset(
        'faculty_assignments',
        this.prisma.facultyAssignment.findMany({
          where: campusId
            ? { offering: { batch: { semester: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'timetable_entries',
        this.prisma.timetableEntry.findMany({
          where: campusId
            ? { offering: { batch: { semester: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'scheduled_sessions',
        this.prisma.scheduledSession.findMany({
          where: campusId
            ? { offering: { batch: { semester: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'lesson_plans',
        this.prisma.lessonPlan.findMany({
          where: campusId
            ? { offering: { batch: { semester: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'units',
        this.prisma.unit.findMany({
          where: campusId
            ? {
                lessonPlan: { offering: { batch: { semester: { campusId } } } },
              }
            : {},
        }),
      ),
      dataset(
        'topics',
        this.prisma.topic.findMany({
          where: campusId
            ? {
                unit: {
                  lessonPlan: {
                    offering: { batch: { semester: { campusId } } },
                  },
                },
              }
            : {},
        }),
      ),
      dataset(
        'exam_scopes',
        this.prisma.examScope.findMany({
          where: campusId ? { examWindow: { semester: { campusId } } } : {},
        }),
      ),
      dataset(
        'topic_schedule_versions',
        this.prisma.topicScheduleVersion.findMany({
          where: campusId
            ? { offering: { batch: { semester: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'topic_schedules',
        this.prisma.topicSchedule.findMany({
          where: campusId
            ? {
                scheduleVersion: {
                  offering: { batch: { semester: { campusId } } },
                },
              }
            : {},
        }),
      ),
      dataset(
        'session_logs',
        this.prisma.sessionLog.findMany({
          where: campusId
            ? {
                scheduledSession: {
                  offering: { batch: { semester: { campusId } } },
                },
              }
            : {},
        }),
      ),
      dataset(
        'session_topic_updates',
        this.prisma.sessionTopicUpdate.findMany({
          where: campusId
            ? {
                sessionLog: {
                  scheduledSession: {
                    offering: { batch: { semester: { campusId } } },
                  },
                },
              }
            : {},
        }),
      ),
      dataset(
        'progress_snapshots',
        this.prisma.progressSnapshot.findMany({
          where: campusId
            ? { offering: { batch: { semester: { campusId } } } }
            : {},
        }),
      ),
      dataset(
        'missed_log_alerts',
        this.prisma.missedLogAlert.findMany({
          where: campusId
            ? {
                scheduledSession: {
                  offering: { batch: { semester: { campusId } } },
                },
              }
            : {},
        }),
      ),
      dataset(
        'notification_deliveries',
        this.prisma.notificationDelivery.findMany({
          where: campusId
            ? {
                alert: {
                  scheduledSession: {
                    offering: { batch: { semester: { campusId } } },
                  },
                },
              }
            : {},
        }),
      ),
      dataset(
        'import_jobs',
        this.prisma.importJob.findMany({ where: campusId ? { campusId } : {} }),
      ),
      dataset(
        'import_errors',
        this.prisma.importError.findMany({
          where: campusId ? { importJob: { campusId } } : {},
        }),
      ),
      dataset(
        'audit_events',
        this.prisma.auditEvent.findMany({
          where: campusId ? { campusId } : {},
        }),
      ),
    ]);
    const rows = datasets.flat();
    const csv = buildCsv(rows, [
      { header: 'dataset', value: (row) => row.dataset },
      { header: 'record_id', value: (row) => row.recordId },
      { header: 'data_json', value: (row) => row.data },
    ]);
    return report(`mirai-full-data-${isoDay(new Date())}.csv`, csv);
  }
}

function subjectProgressColumns(asOf: string) {
  return [
    { header: 'as_of_date', value: () => asOf },
    { header: 'campus_code', value: (row: ProgressSubject) => row.campus.code },
    { header: 'campus_name', value: (row: ProgressSubject) => row.campus.name },
    { header: 'track_code', value: (row: ProgressSubject) => row.track.code },
    { header: 'track_name', value: (row: ProgressSubject) => row.track.name },
    { header: 'batch_code', value: (row: ProgressSubject) => row.batch.code },
    { header: 'batch_name', value: (row: ProgressSubject) => row.batch.name },
    {
      header: 'subject_code',
      value: (row: ProgressSubject) => row.subject.code,
    },
    {
      header: 'subject_name',
      value: (row: ProgressSubject) => row.subject.name,
    },
    {
      header: 'target_finish_date',
      value: (row: ProgressSubject) => row.targetFinishDate,
    },
    {
      header: 'hours_in_scope',
      value: (row: ProgressSubject) => row.hoursInScope,
    },
    {
      header: 'covered_hours',
      value: (row: ProgressSubject) => row.coveredHours,
    },
    {
      header: 'coverage_percentage',
      value: (row: ProgressSubject) => row.coveragePercentage,
    },
    {
      header: 'remaining_hours',
      value: (row: ProgressSubject) => row.remainingHours,
    },
    {
      header: 'available_hours',
      value: (row: ProgressSubject) => row.availableHours,
    },
    {
      header: 'planned_hours_by_today',
      value: (row: ProgressSubject) => row.plannedHoursByToday,
    },
    {
      header: 'pace_vs_plan_hours',
      value: (row: ProgressSubject) => row.paceVsPlanHours,
    },
    {
      header: 'buffer_ratio',
      value: (row: ProgressSubject) => row.bufferRatio,
    },
    {
      header: 'overdue_topic_count',
      value: (row: ProgressSubject) => row.overdueTopics.length,
    },
    {
      header: 'overdue_topics',
      value: (row: ProgressSubject) =>
        row.overdueTopics.map((topic) => topic.title).join(' | '),
    },
    { header: 'status', value: (row: ProgressSubject) => row.status },
  ];
}

type HonorariumRow = {
  month: string;
  campusCode: string;
  campusName: string;
  trackCode: string;
  batchCode: string;
  subjectCode: string;
  subjectName: string;
  facultyName: string;
  facultyEmail: string;
  employeeCode: string;
  plannedLectures: number;
  takenLectures: number;
  takenMinutes: number;
  ratePerLecture: number;
  honorariumAmount: number;
};

const honorariumColumns = [
  { header: 'month', value: (row: HonorariumRow) => row.month },
  { header: 'campus_code', value: (row: HonorariumRow) => row.campusCode },
  { header: 'campus_name', value: (row: HonorariumRow) => row.campusName },
  { header: 'track_code', value: (row: HonorariumRow) => row.trackCode },
  { header: 'batch_code', value: (row: HonorariumRow) => row.batchCode },
  { header: 'subject_code', value: (row: HonorariumRow) => row.subjectCode },
  { header: 'subject_name', value: (row: HonorariumRow) => row.subjectName },
  { header: 'faculty_name', value: (row: HonorariumRow) => row.facultyName },
  { header: 'faculty_email', value: (row: HonorariumRow) => row.facultyEmail },
  { header: 'employee_code', value: (row: HonorariumRow) => row.employeeCode },
  {
    header: 'planned_lectures',
    value: (row: HonorariumRow) => row.plannedLectures,
  },
  {
    header: 'taken_lectures',
    value: (row: HonorariumRow) => row.takenLectures,
  },
  { header: 'taken_minutes', value: (row: HonorariumRow) => row.takenMinutes },
  {
    header: 'rate_per_lecture',
    value: (row: HonorariumRow) => row.ratePerLecture,
  },
  {
    header: 'honorarium_amount',
    value: (row: HonorariumRow) => row.honorariumAmount,
  },
];

function monthRange(month: string) {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

async function dataset(
  name: string,
  recordsPromise: Promise<Array<{ id: string; [key: string]: unknown }>>,
): Promise<FullDataRow[]> {
  const records = await recordsPromise;
  return records.map((record) => ({
    dataset: name,
    recordId: record.id,
    data: JSON.stringify(record),
  }));
}

function report(filename: string, csv: string) {
  return {
    filename,
    contentType: 'text/csv; charset=utf-8',
    content: csvBuffer(csv),
  };
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}
