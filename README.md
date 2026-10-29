# Mirai Course Progression Tracker

[Live application](https://mirai-tracker.vercel.app) · [Submission files](SUBMISSION.md) · [Test report](docs/test-report.md) · [Scalability report](docs/scalability-report.md)

Mirai Tracker connects semester calendars, batch timetables, lesson plans, teaching logs and exam readiness across **HI-Tech, Jaggannath and Rathinam**. A batch can contain subjects in both the **Mirai and University tracks**.

![System architecture](docs/architecture.svg)

## Populated demonstration

Choose **Evaluator Demo · Odd Semester 2026** in any campus. Each has five fictional faculty, five subjects, a student batch, calendar, timetable, lesson plans, teaching history, two exams and visiting-faculty accounting. The live seed contains **450 topics, 885 dated classes and 540 lecture logs**.

Start with Subjects → a demo subject, then inspect Reports, Progress, Exam readiness and Visiting faculty. Faculty see assigned subjects; students see their enrolled batch without edit controls. [Evaluator guide](docs/evaluator-guide.md)

Existing institutional records remain separate. Passwords and OTP destinations are in the owner's private handoff file, not this repository. Local setup generates independent credentials.

The 52 existing live demo accounts use password-only sign-in by owner request. Other accounts and newly created accounts require email OTP by default. Password recovery still requires email verification.

## One-command local setup

Prerequisites: Git, Docker Desktop with Compose, and OpenSSL.

```bash
sh scripts/setup-demo.sh
```

This generates a local `.env` if absent, builds and starts PostgreSQL, Redis, Mailpit, API, worker and web, applies migrations, and adds the three-campus demo. Existing configuration and completed demo semesters are preserved.

Open http://localhost:5173. Sign in as `evaluator.admin@mirai.local`, using `DEMO_USER_PASSWORD` from `.env`. Read the six-digit verification code at http://localhost:8025. Other accounts are in `outputs/evaluator-accounts.json`. Stop with `docker compose down`.

The one-command setup was exercised on a fresh isolated Docker Compose project on 20 October 2026: all six services became healthy and the three-campus demo loaded.

API readiness: http://localhost:3000/health/ready. Set `API_PORT`, `WEB_PORT`, `VITE_API_URL` and `WEB_ORIGIN` in `.env` if application ports are occupied.

## Roles

| Role                            | Access                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator / Program Manager | All campuses; semester setup, calendar import, subjects, access, reports, progress, notifications, exams and exports                           |
| Campus Manager                  | Assigned campus; subjects, calendar/exam edits, batch timetables, extra classes, faculty/student access, reports and visiting-faculty expenses |
| Faculty                         | Assigned subjects; lesson plans, planned dates, daily logs, own teaching reports, notifications and subject analysis                           |
| Student                         | Read-only subjects, teachers, coverage, upcoming classes and exams for the enrolled batch                                                      |

## Connected workflow

1. The administrator creates a semester and imports holidays, events and exams.
2. The campus manager uploads a complete batch timetable or edits recurring and extra classes.
3. Subjects retain allocated hours before a visiting teacher is assigned.
4. Faculty review available hours, upload partial or semester plans, map exam topics and log teaching.
5. Calendar/timetable changes recalculate dependent dates. Affected classes can require teacher review before a recovery move.
6. Reports, notifications, exports and AI context follow campus and subject permissions.

The full semester import interface is intentionally removed. Calendar, timetable, lesson-plan and student-access imports remain in their own workspaces. Full semester export is retained. Legacy backend import tests are labelled separately.

## Analytics

Canonical quantities are minutes. Coverage is weighted by planned topic duration, including partial completion. Missing logs mean teaching is unverified; they do not prove a class was missed.

**Buffer ratio = available future teaching hours ÷ remaining syllabus hours.**

| Default ratio     | Status   |
| ----------------- | -------- |
| ≥ 1.15            | ON TRACK |
| ≥ 1.00 and < 1.15 | TIGHT    |
| < 1.00            | DANGER   |

Thresholds are configurable by semester. Completed and missing-plan cases are distinct. Subject views, exam readiness, reports and AI context use the shared rules.

## Reports and automation

Reports cover course progress, teaching delivery, faculty activity, exam readiness and manager-only campus/track analysis. Faculty reports are restricted to their teaching. Generated reports use formatted text and charts. Full semester exports preserve structured records.

Notifications identify the actor and affected scope. Missing logs trigger end-of-day reminders and 48-hour manager escalation. Weekly summaries are scheduled for Monday 08:30 campus time, saved in AI insights and emailed through configured SMTP. Demo previews are labelled and not reported as sent email.

AI helps interpret files, analyze subjects and suggest recovery actions. CSV/XLSX rows are parsed deterministically before verification. A calculated fallback handles unavailable models. WhatsApp logging requires configured Meta credentials and webhooks; see [API environment variables](apps/api/.env.vercel.example).

## Verification

Node 22.13+ is the supported development runtime.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm verify:m10
```

The current suite includes **615 automated tests** across the API, web app, worker and shared packages. The dated evidence also includes **27 PostgreSQL integration tests**, **11 authenticated permission checks** and **18 independent numeric comparisons** across three subjects. Local scale data contains 3 campuses, 60 faculty, 30 subjects and 1,020 students. Real HTTP load tests cover 50/100/200 concurrent clients.

The **What-if recovery planner** compares the extra teaching time required to move a subject from danger to tight or on track. It is read-only and uses each subject's configured buffer thresholds.

Database integration tests use disposable databases. Never point them or the loopback-only load harness at production. Five fictional-account logging timings are automated API measurements, not human phone observations.

## Architecture and operations

React/Vite PWA and NestJS API run on Vercel behind a same-origin `/api` proxy. Supabase PostgreSQL stores relational data; Upstash Redis stores sessions and transient state. QStash invokes protected scheduled jobs. SMTP, AI and WhatsApp are external integrations. Local Compose uses PostgreSQL, a BullMQ worker and Mailpit.

| Directory                | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| apps/web                 | React interface                                   |
| apps/api                 | NestJS, Prisma, authorization and domain services |
| apps/worker              | BullMQ background jobs                            |
| packages/calculations    | Shared academic calculations                      |
| packages/validation      | Shared validation                                 |
| docs/submission          | Downloadable reports and calculation workbook     |
| docs/evidence/2026-10-20 | Current measured evidence                         |

[Design](docs/design-document.md) · Role workflows: [Word](docs/submission/Mirai_Tracker_Role_Workflows_and_Access.docx), [PDF](docs/submission/Mirai_Tracker_Role_Workflows_and_Access.pdf), [Markdown source](docs/role-workflows.md) · [Architecture source](docs/architecture.mmd) · [Backup/recovery](docs/m17-security-and-recovery.md) · [Future enhancements](docs/future-enhancements.md)

Secrets, local evaluator credentials and `outputs/` are excluded from Git and image build contexts. Earlier milestone documents are historical; this README and the dated submission reports describe the current product.
