# Design Document

## 1. Purpose

Mirai Tracker replaces spreadsheet-based syllabus monitoring with one calendar-aware record of planned and delivered teaching. It answers four operational questions: what should have been covered, what was actually covered, whether enough timetable capacity remains, and what action is needed before an exam.

## 2. Users and permissions

| Role                    | Main capabilities                                                         | Scope                          |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| Admin / Program Manager | Academic setup, imports, all dashboards, audit history and exports        | All campuses                   |
| Campus Manager          | Campus timetable, faculty coordination, campus dashboards and escalations | Assigned campus                |
| Faculty                 | Lesson plans, assigned daily sessions and own subject dashboards          | Active assignments             |
| Student                 | Covered topics, next topics and exam scope                                | Authenticated batch, read-only |

Authentication uses password plus a six-digit email OTP before issuing an HTTP-only opaque session. The permission layer can later accept Google Workspace or institutional identities without changing domain access rules.

## 3. Functional design

### Academic setup and import

Semesters belong to campuses and define dates, timezone-aware working rules, default progress thresholds and exam windows. CSV/XLSX preview validates complete rows before an atomic import creates the campus-semester-batch-subject graph. Error exports identify the exact row and field.

### Calendar and timetable

The calendar evaluates explicit overrides first, then Sunday and configured Saturday rules, then ordinary weekdays. Recurring timetable entries include effective dates, faculty assignment and planned minutes. Generation rejects batch or faculty overlap and preserves sessions with academic history.

### Lesson plans and planned dates

Versioned lesson plans contain ordered units and topics. Planned minutes are the source of truth; displayed hours are derived. Topic-level exam mappings define exact mid-term and end-term scope. The scheduling engine carries topic minutes across real sessions, exposes insufficient capacity and creates a new version after relevant changes.

### Daily logging

Faculty receive scheduled classes with subject, batch, current topic and carry-forward pre-filled. Completed, partially completed, skipped, merged and cancelled paths are explicit. Corrections create a new revision. Topic progress, session state, audit data and recalculated planned dates are committed atomically.

### Progress and readiness

For non-skipped topics:

- hours in scope = sum of planned minutes / 60;
- covered minutes = completed planned minutes plus in-progress planned minutes multiplied by completion percentage;
- coverage = covered / in-scope;
- remaining = in-scope minus covered;
- available = future timetable minutes through the target finish date;
- buffer = available / remaining;
- pace = covered minus planned coverage expected by the selected date.

The default status is ON TRACK at buffer >= 1.15, TIGHT at buffer >= 1.00 and DANGER below 1.00. Percentages are hour-weighted. Campus and track status uses the worst subject so healthy aggregates cannot hide a subject at risk. Exam readiness applies the same calculation only to topics mapped to that exam.

### Alerts and exports

The worker scans every five minutes. An unlogged class triggers a faculty reminder after the campus day ends and a Campus Manager escalation at 48 hours. Unique keys prevent duplicate delivery. Manager exports cover campus progress, subject progress, visiting-faculty honorarium and a long-form archive; every export creates job and audit records.

## 4. Data design

The PostgreSQL model contains 30 domain models. Major groups are:

- identity: User, PasswordCredential, RoleAssignment, StaffProfile and StudentProfile;
- setup: Campus, Track, Semester, Batch, Subject and SubjectOffering;
- calendar: CalendarDayOverride and ExamWindow;
- scheduling: FacultyAssignment, TimetableEntry and ScheduledSession;
- curriculum: LessonPlan, Unit, Topic, ExamScope, TopicScheduleVersion and TopicSchedule;
- delivery: SessionLog and SessionTopicUpdate;
- operations: ImportJob, ProgressSnapshot, MissedLogAlert, NotificationDelivery, ExportJob and AuditEvent.

Foreign keys, compound uniqueness, enum states and SQL constraints complement application validation. Imports and session logging use transactions. Historical plans, schedule versions, log revisions, snapshots and audit events are retained instead of overwritten.

## 5. Security design

Passwords use scrypt with individual salts. OTP challenges expire after ten minutes, store only an HMAC digest and enforce request and verification limits. Session tokens contain 256 random bits and only an HMAC-derived key is stored in Redis. Cookies are HTTP-only, SameSite=Lax and Secure in production. Failed login counts expire after 15 minutes. Helmet, exact CORS, the mutation-origin guard, Zod schemas, upload limits and generic unexpected-error responses reduce common web risks.

Production startup rejects weak secrets, HTTP origins and demo passwords. The local and production databases are not published directly. Backups use PostgreSQL custom format, owner-restricted file permissions and SHA-256 checksums. Verification restores into a disposable database before a real restore is allowed.

## 6. Scalability and reliability

The API is stateless apart from Redis sessions, so multiple replicas can share PostgreSQL and Redis. Indexed foreign keys support campus and subject filtering. Dashboards calculate from bounded relational queries and shared pure functions. BullMQ separates scheduled work from user requests. For wider use, managed PostgreSQL with point-in-time recovery, managed Redis, object storage for uploaded files and multiple API replicas are the next steps.

The recorded target is four campuses, 60+ faculty, 30+ subjects and 1,000+ students. The local M16 workload used four campuses and 30 subjects at 50, 100 and 200 concurrent clients with zero errors. Production capacity must be rerun after M18 goes live.

## 7. Deployment design

The production Compose stack contains Caddy, Nginx web, API, worker, PostgreSQL and Redis. Caddy obtains HTTPS and routes `/api` to NestJS. PostgreSQL and Redis use private persistent volumes. Health checks order startup and the API applies migrations before serving. Demonstration seeding is a one-time command whose password is absent from the persistent runtime environment.

## 8. Key decisions

- PostgreSQL was selected over MongoDB because timetable, role scope, exam and log data need strong relations and transactional imports.
- Minutes remain canonical to avoid floating-point drift; hours are presentation values.
- The application stores calculated versions and audit events for explainability.
- A responsive PWA provides one codebase for desktop managers and phone-first faculty.
- Local password identities enable demonstration without external accounts; production identity integration is a later controlled change.

## 9. Current limitations

The machine used for development has no Docker runtime. PostgreSQL integration tests, the disposable restore drill and production image execution therefore remain pending. The required five-faculty phone study has a prepared capture sheet but still needs real volunteers. The public URL, DNS and SMTP credentials depend on the deployer. These items are visible in the submission checklist and are not reported as passed.
