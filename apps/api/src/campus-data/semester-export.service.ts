import { Injectable } from '@nestjs/common';
import { academicTrackIdentity } from '@mirai/calculations';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  buildAcademicCalendar,
  formatIsoDate,
} from '../academic-calendar/calendar-engine';
import { VisitingFacultyService } from './visiting-faculty.service';
import { ReportsService } from '../reports/reports.service';
import { topicDisplayTitle } from '../lesson-plan/topic-title';

export type SemesterExportSheets = Record<string, Record<string, unknown>[]>;
const date = (value: Date | null) => (value ? formatIsoDate(value) : '');
const time = (value: Date) => value.toISOString().slice(11, 16);
const person = { id: true, name: true, email: true } as const;

@Injectable()
export class SemesterExportService {
  constructor(
    private readonly db: PrismaService,
    private readonly visiting: VisitingFacultyService,
    private readonly reports: ReportsService,
  ) {}

  async read(
    semesterId: string,
    user: AuthenticatedUser,
  ): Promise<SemesterExportSheets> {
    // Authorize the selected semester before reading any related records.
    const sem = await this.visiting.semester(semesterId, user);
    const [
      overrides,
      exams,
      batches,
      offerings,
      sessions,
      plans,
      schedules,
      report,
      visiting,
    ] = await Promise.all([
      this.db.calendarDayOverride.findMany({
        where: { semesterId },
        orderBy: { date: 'asc' },
      }),
      this.db.examWindow.findMany({
        where: { semesterId },
        orderBy: { startDate: 'asc' },
      }),
      this.db.batch.findMany({
        where: { semesterId },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, active: true },
      }),
      this.db.subjectOffering.findMany({
        where: { batch: { semesterId } },
        orderBy: [
          { batch: { name: 'asc' } },
          { academicTrack: 'asc' },
          { subject: { name: 'asc' } },
        ],
        include: {
          subject: true,
          batch: { select: { name: true, code: true } },
          faculty: {
            include: {
              staffProfile: { include: { user: { select: person } } },
            },
          },
          timetableEntries: {
            orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
          },
        },
      }),
      this.db.scheduledSession.findMany({
        where: { offering: { batch: { semesterId } } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        include: {
          logs: {
            orderBy: { revision: 'desc' },
            include: {
              loggedBy: { select: person },
              carryForwardTopic: {
                select: {
                  title: true,
                  unit: { select: { title: true } },
                },
              },
              topicUpdates: {
                include: {
                  topic: {
                    select: {
                      title: true,
                      unit: { select: { title: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.db.lessonPlan.findMany({
        where: { offering: { batch: { semesterId } } },
        orderBy: [{ offeringId: 'asc' }, { version: 'asc' }],
        include: {
          uploadedBy: { select: person },
          units: {
            orderBy: { sequence: 'asc' },
            include: {
              topics: {
                orderBy: { sequence: 'asc' },
                include: { examScopes: true },
              },
            },
          },
        },
      }),
      this.db.topicScheduleVersion.findMany({
        where: { offering: { batch: { semesterId } } },
        orderBy: [{ offeringId: 'asc' }, { version: 'desc' }],
        include: {
          entries: {
            include: {
              topic: {
                select: {
                  title: true,
                  unit: { select: { title: true } },
                },
              },
            },
          },
        },
      }),
      this.reports.read(user, {
        campusId: sem.campusId,
        semesterId,
        tab: 'course',
        deliveryStatus: 'ALL',
      }),
      this.visiting.dashboard(semesterId, user),
    ]);
    const byOffering = new Map(offerings.map((o) => [o.id, o]));
    const byExam = new Map(exams.map((e) => [e.id, e.name]));
    const context = (offeringId: string) => {
      const o = byOffering.get(offeringId)!;
      return {
        offering_id: o.id,
        batch: o.batch.name,
        batch_code: o.batch.code,
        track: academicTrackIdentity(o.academicTrack).name,
        subject: o.subject.name,
        subject_code: o.subject.code,
      };
    };
    const teacher = (offeringId: string, assignmentId: string | null) =>
      byOffering.get(offeringId)?.faculty.find((f) => f.id === assignmentId)
        ?.staffProfile.user.name ?? '';
    const calendar = buildAcademicCalendar({
      semesterStart: date(sem.startDate),
      semesterEnd: date(sem.endDate),
      saturdayRule: sem.workingSaturdayRule,
      overrides: overrides.map((o) => ({ ...o, date: date(o.date) })),
    });
    const sheets: SemesterExportSheets = {
      Semester: [
        {
          semester_id: sem.id,
          semester: sem.name,
          campus: sem.campus.name,
          campus_code: sem.campus.code,
          start_date: date(sem.startDate),
          end_date: date(sem.endDate),
          working_saturdays: sem.workingSaturdayRule,
          timezone: sem.campus.timezone,
          status: sem.status,
          exported_at: new Date().toISOString(),
          exported_by: user.name,
          ...calendar.summary,
        },
      ],
      Calendar: calendar.days.map((d) => ({
        date: d.date,
        day: d.weekday,
        teaching_allowed: d.working,
        type: d.reason,
        title: d.override?.title ?? '',
        notes: d.override?.notes ?? '',
        explicit_override: !!d.override,
      })),
      Exams: exams.map((e) => ({
        exam_id: e.id,
        name: e.name,
        type: e.type,
        start_date: date(e.startDate),
        end_date: date(e.endDate),
        syllabus_deadline: date(e.syllabusDeadline),
      })),
      Batches: batches.map((b) => ({
        batch_id: b.id,
        batch_code: b.code,
        batch: b.name,
        active: b.active,
        tracks: [
          ...new Set(
            offerings
              .filter((o) => o.batchId === b.id)
              .map((o) => academicTrackIdentity(o.academicTrack).name),
          ),
        ].join(' | '),
      })),
      Subjects: offerings.map((o) => ({
        ...context(o.id),
        subject_id: o.subjectId,
        description: o.subject.description ?? '',
        target_finish: date(o.targetFinishDate),
        status: o.status,
        subject_active: o.subject.active,
      })),
      'Faculty assignments': offerings.flatMap((o) =>
        o.faculty.map((f) => ({
          ...context(o.id),
          assignment_id: f.id,
          faculty: f.staffProfile.user.name,
          email: f.staffProfile.user.email,
          employee_code: f.staffProfile.employeeCode,
          staff_type: f.staffProfile.staffType,
          assignment_type: f.type,
          start_date: date(f.startDate),
          end_date: date(f.endDate),
          active: f.active,
        })),
      ),
      'Weekly timetable': offerings.flatMap((o) =>
        o.timetableEntries.map((t) => ({
          ...context(o.id),
          timetable_id: t.id,
          day: [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
          ][t.weekday],
          start_time: time(t.startTime),
          end_time: time(t.endTime),
          effective_from: date(t.effectiveFrom),
          effective_to: date(t.effectiveTo),
          teacher: teacher(o.id, t.facultyAssignmentId),
          active: t.active,
        })),
      ),
      'Scheduled classes': sessions.map((s) => ({
        ...context(s.offeringId),
        session_id: s.id,
        date: date(s.sessionDate),
        starts_at: s.startsAt.toISOString(),
        ends_at: s.endsAt.toISOString(),
        timezone: sem.campus.timezone,
        teacher: teacher(s.offeringId, s.facultyAssignmentId),
        status: s.status,
        extra_class: s.isExtraSession,
        cancellation_reason: s.cancellationReason ?? '',
        merged_into_session: s.mergedIntoSessionId ?? '',
        has_log: s.logs.length > 0,
      })),
      'Lecture logs': sessions.flatMap((s) =>
        s.logs.map((l, i) => ({
          ...context(s.offeringId),
          session_id: s.id,
          date: date(s.sessionDate),
          log_id: l.id,
          revision: l.revision,
          latest_revision: i === 0,
          status: l.status,
          completion_percent:
            l.overallCompletionPercentage == null
              ? ''
              : Number(l.overallCompletionPercentage),
          covered: l.coveredSummary,
          left_over: l.leftOverSummary ?? '',
          carry_forward_topic: l.carryForwardTopic
            ? topicDisplayTitle(
                l.carryForwardTopic.title,
                l.carryForwardTopic.unit.title,
              )
            : '',
          classwork: l.classworkStatus,
          homework: l.homeworkStatus,
          notes: l.notes ?? '',
          logged_by: l.loggedBy.name,
          logged_at: l.loggedAt.toISOString(),
        })),
      ),
      'Topic log updates': sessions.flatMap((s) =>
        s.logs.flatMap((l) =>
          l.topicUpdates.map((t) => ({
            ...context(s.offeringId),
            session_id: s.id,
            log_id: l.id,
            revision: l.revision,
            topic_id: t.topicId,
            topic: topicDisplayTitle(t.topic.title, t.topic.unit.title),
            completion_before: Number(t.completionBeforePercentage),
            completion_after: Number(t.completionAfterPercentage),
            minutes_used: t.minutesUsed ?? '',
            notes: t.notes ?? '',
          })),
        ),
      ),
      'Lesson plans': plans.map((p) => ({
        ...context(p.offeringId),
        plan_id: p.id,
        version: p.version,
        status: p.status,
        file_name: p.fileName ?? '',
        uploaded_by: p.uploadedBy.name,
        uploaded_at: p.createdAt.toISOString(),
        approved_at: p.approvedAt?.toISOString() ?? '',
      })),
      Units: plans.flatMap((p) =>
        p.units.map((u) => ({
          ...context(p.offeringId),
          plan_id: p.id,
          plan_version: p.version,
          unit_id: u.id,
          sequence: u.sequence,
          title: u.title,
          description: u.description ?? '',
        })),
      ),
      Topics: plans.flatMap((p) =>
        p.units.flatMap((u) =>
          u.topics.map((t) => ({
            ...context(p.offeringId),
            plan_id: p.id,
            plan_version: p.version,
            plan_status: p.status,
            unit: u.title,
            topic_id: t.id,
            sequence: t.sequence,
            topic: topicDisplayTitle(t.title, u.title),
            description: t.description ?? '',
            planned_hours: t.plannedMinutes / 60,
            completion_percent: Number(t.currentCompletionPercentage),
            status: t.status,
            skip_reason: t.skipReason ?? '',
          })),
        ),
      ),
      'Exam syllabus': plans.flatMap((p) =>
        p.units.flatMap((u) =>
          u.topics.flatMap((t) =>
            t.examScopes.map((e) => ({
              ...context(p.offeringId),
              plan_id: p.id,
              plan_version: p.version,
              topic_id: t.id,
              topic: topicDisplayTitle(t.title, u.title),
              exam_id: e.examWindowId,
              exam: byExam.get(e.examWindowId) ?? '',
            })),
          ),
        ),
      ),
      'Planned dates': schedules.flatMap((v) =>
        v.entries.map((t) => ({
          ...context(v.offeringId),
          schedule_version: v.version,
          latest_version:
            schedules.find((s) => s.offeringId === v.offeringId)?.id === v.id,
          calculated_at: v.calculatedAt.toISOString(),
          reason: v.reason,
          topic_id: t.topicId,
          topic: topicDisplayTitle(t.topic.title, t.topic.unit.title),
          planned_start: date(t.plannedStartDate),
          planned_finish: date(t.plannedFinishDate),
          allocated_minutes: t.allocatedMinutes,
        })),
      ),
      'Course progress': report.subjects.map((s) => ({
        ...context(s.id),
        status: s.status,
        reason: s.reason,
        deadline: s.deadline,
        ...s.metrics,
        scheduled_classes: s.scheduled,
        logged_classes: s.logged,
        unlogged_classes: s.unlogged,
        upcoming_classes: s.upcoming,
      })),
      'Exam readiness': report.exams.map((e) => ({
        ...context(e.id.split(':')[0]!),
        exam: e.exam,
        exam_date: e.date,
        syllabus_deadline: e.deadline,
        status: e.status,
        scope: e.scopeMode,
        coverage_percent: e.coverage,
        remaining_hours: e.remainingHours,
        teaching_hours: e.teachingHours,
        buffer_ratio: e.bufferRatio,
        on_track_threshold: e.thresholds.onTrack,
        tight_threshold: e.thresholds.tight,
        reason: e.reason,
      })),
      'Visiting faculty': visiting.faculty.map((f) => ({
        ...f,
        subjects: f.subjects.map((s) => `${s.code} / ${s.batch}`).join(' | '),
      })),
      'Visiting classes': visiting.classes,
      'Expenses and payments': visiting.ledger.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      'Cost summary': [
        {
          currency: visiting.currency,
          ...visiting.summary,
          unresolved_classes: visiting.unresolvedClasses,
        },
      ],
    };
    // Keep empty datasets discoverable without inventing academic records.
    sheets['Contents'] = Object.entries(sheets).map(([dataset, rows]) => ({
      dataset,
      records: rows.length,
    }));
    await this.db.auditEvent.create({
      data: {
        actorId: user.id,
        campusId: sem.campusId,
        action: 'EXPORT',
        entityType: 'Semester',
        entityId: sem.id,
        metadata: { datasets: Object.keys(sheets), semesterName: sem.name },
      },
    });
    return sheets;
  }
}
