# Mirai Course Progression Tracker

A mobile-first course progression platform for tracking planned and delivered syllabus hours, calendar-aware topic dates, exam readiness, early warnings and student visibility across MSOT campuses.

The consolidated architecture, design, Test Report, demo script and final checks are indexed in [SUBMISSION.md](SUBMISSION.md).

## Technology

- React, TypeScript and Vite PWA frontend
- NestJS REST API
- PostgreSQL with Prisma
- Redis and BullMQ background worker
- Mailpit local email capture
- pnpm workspace monorepo
- Docker Compose local environment

## One-command setup

1. Copy `.env.example` to `.env`.
2. Start the stack:

```bash
docker compose up --build
```

Services:

- Web: http://localhost:5173
- API liveness: http://localhost:3000/health/live
- API readiness: http://localhost:3000/health/ready
- Mailpit: http://localhost:8025

If ports 3000 or 5173 are already in use, set `API_PORT`, `WEB_PORT`, `VITE_API_URL` and `WEB_ORIGIN` in `.env`. Container-to-container ports remain unchanged.

Docker Desktop or another Docker-compatible runtime is required.

## Local development without Docker

Node.js 22.13 or newer and pnpm are required. PostgreSQL and Redis must be available separately for the readiness endpoint and worker.

```bash
pnpm install
pnpm db:generate
pnpm dev
```

## Verification

```bash
pnpm check
```

This runs TypeScript checks, automated tests and production builds across the workspace.

## Database workflow

The API container applies committed PostgreSQL migrations before NestJS starts. To add the fictional local sample after the stack is running:

```bash
docker compose exec api pnpm --filter @mirai/api prisma:seed
```

Run the database constraint tests against that migrated container:

```bash
docker compose exec api pnpm --filter @mirai/api test:database
```

For local commands outside Docker, make `DATABASE_URL` available in the shell first, then use `pnpm db:migrate:deploy`, `pnpm db:seed` and `pnpm db:test`.

The M02 model, relationship diagram and requirement mapping are documented in [docs/m02-database-model.md](docs/m02-database-model.md).

## Local demo login

Set `DEMO_USER_PASSWORD` and `DEMO_NOTIFICATION_EMAIL` in `.env`, start the stack and run the seed command. The login page can then use one of four fictional identities: `admin@mirai.local`, `campus.manager@mirai.local`, `faculty@mirai.local` or `student@mirai.local`. These addresses create no external accounts; the notification address receives their six-digit login codes. With local Mailpit, use any address such as `demo-inbox@mirai.local` and read the message at http://localhost:8025.

After a correct password, the API emails a ten-minute one-time code. A session is created only after that code is verified. Sessions are stored in Redis and delivered through an HTTP-only cookie. The API reloads role and scope information from PostgreSQL on every protected request. See [docs/m03-authentication-and-permissions.md](docs/m03-authentication-and-permissions.md) for the security flow and permission matrix.

Campus Managers can create faculty accounts only for their assigned campus from the Faculty access workspace. They set the login and OTP email, employee code, regular or visiting status, an initial password and optional subject assignments. Creation is transactional and audited; the password is stored only as a scrypt hash. See [docs/faculty-access.md](docs/faculty-access.md) for the workflow and safeguards.

## Semester calendar

Program Managers can create campus semesters, choose the working-Saturday rule, add dated holidays/events/extra working days and define exam windows. The API produces an explainable working/non-working result for every date. See [docs/m04-semester-calendar.md](docs/m04-semester-calendar.md) for the decision order, routes, validations and test coverage.

## Semester import

Admin and Program Manager users can download CSV or Excel templates, validate a complete semester before writing data, import the campus/semester/batch/subject graph atomically, inspect import history and download row-level error reports. The supplied fictional template demonstrates the three current campuses and 25 subjects. See [docs/m05-semester-import.md](docs/m05-semester-import.md) for columns, routes, validation and verification details.

## Timetable setup

Admin, Program Manager and Campus Manager users can define recurring weekly slots for each subject offering. The API derives planned minutes from start/end times and generates dated sessions using the M04 working calendar, campus timezone, effective dates and faculty assignments. It rejects batch and faculty overlaps and preserves logged academic history during regeneration. See [docs/m06-timetable.md](docs/m06-timetable.md) for rules, routes and verification details.

## Lesson plans and exam scope

Managers and assigned faculty can preview and import CSV/Excel lesson plans, edit draft units/topics and planned minutes, map topics to exact exam windows and activate a version without overwriting earlier plans. The fictional DSA template contains three units, eight topics and 23 planned hours. See [docs/m07-lesson-plan-and-exam-scope.md](docs/m07-lesson-plan-and-exam-scope.md) for the columns, version lifecycle, permissions and API routes.

## Planned topic dates

Managers and assigned faculty can allocate ordered lesson-plan minutes across real scheduled classes, inspect each topic's expected start/finish dates and see a clear capacity shortfall. Holidays are absent through the academic calendar, while cancelling or restoring an unlogged class shifts affected topics and saves a new calculation version. See [docs/m08-planned-date-engine.md](docs/m08-planned-date-engine.md) for the algorithm, hand-worked example, permissions and API routes.

## Mobile daily session logging

Faculty receive a phone-first list of their scheduled classes with subject, batch, time, current topic, suggested completion and carry-forward already filled in. One confirmation saves an immutable revision, per-topic progress, classwork/homework and an audit record; skipped, merged and cancelled paths keep topic progress safe. See [docs/m09-mobile-session-logging.md](docs/m09-mobile-session-logging.md) for the rules, API and the required five-faculty timing-study protocol.

## Progress calculation engine

The shared M10 engine calculates hour-weighted scope, coverage, remaining and available hours, configurable buffer status, signed pace against plan and overdue topics. Scoped API routes expose live subject results and let authorized staff store versioned, audited snapshots. Run `pnpm verify:m10` to compare ON TRACK, TIGHT and DANGER subjects with the three hand calculations in [docs/evidence/m10-hand-calculations.csv](docs/evidence/m10-hand-calculations.csv). See [docs/m10-progress-calculation-engine.md](docs/m10-progress-calculation-engine.md) for formulas, date conventions and routes.

## Progress dashboards

Faculty and managers receive one date-controlled dashboard with subject, track and campus views. Every level shows planned, covered, remaining and available hours, weighted coverage, buffer, status and pace. Track and campus status always carries the worst subject status, so a healthy aggregate cannot hide a subject in danger. See [docs/m11-progress-dashboards.md](docs/m11-progress-dashboards.md) for the permission scopes, formulas, API and verification.

## Exam readiness

Every upcoming exam has an independent readiness view built from its exact M07 topic mappings. Faculty and managers see hour-weighted in-scope coverage, planned and covered hours, hours still needed, deadlines and subject-level topic scope. Past exams are removed, while an unmapped future exam stays visible for correction. See [docs/m12-exam-readiness.md](docs/m12-exam-readiness.md) for the formulas, permissions, API and mid-term/end-term test evidence.

## Student read-only view

Students receive one authenticated batch view with subject coverage, completed and in-progress topics, the next planned topics and upcoming exam dates with exact syllabus scope. The browser supplies no batch identifier, and the student controller exposes only a protected `GET` route with no editing controls. See [docs/m13-student-read-only-view.md](docs/m13-student-read-only-view.md) for the scope, read-only safeguards and verification.

## Missed-log reminders

The worker scans unlogged scheduled classes every five minutes. It sends the assigned faculty member one SMTP and in-app reminder at the end of the campus day, then notifies the Campus Manager if the same log is still missing 48 hours after the class ended. Database deduplication prevents repeat sends, and adding the late log cancels pending delivery. Mailpit captures local email without an external account. See [docs/m14-missed-log-alerts.md](docs/m14-missed-log-alerts.md) for timing, worker security, delivery records and verification.

## Reports and CSV exports

Admin and Program Manager users can download campus and subject progress, monthly visiting-faculty planned-versus-taken lecture counts with calculated honorarium, and a complete long-form academic archive. Every request creates a visible export job and audit event. UTF-8/RFC 4180 output opens cleanly in Excel or Google Sheets, and formula-like user data is neutralised. See [docs/m15-csv-exports.md](docs/m15-csv-exports.md) for columns, calculation rules, permissions, routes and verification.

## Performance and scalability

The M16 load harness measures full client-observed latency and errors for dashboard reads and end-of-day session logging at 50, 100 and 200 concurrent users. The committed four-campus/30-subject local baseline completes 2,100 measured requests with zero errors; dashboard p95 stays below 79 ms and logging p95 below 30 ms. The API exposes `Server-Timing` and `X-Response-Time` for diagnostics. Run `pnpm load:m16` and `pnpm verify:m16`, or use the included k6 scenario. See [docs/m16-performance-and-scalability.md](docs/m16-performance-and-scalability.md) for methodology, exact results, environment variables and the required post-deployment rerun.

## Security and recovery

M17 adds production environment validation, failed-login throttling, browser-origin checks, manager-only audit history, safe unexpected-error responses and loopback-only local ports. PostgreSQL backup, checksum, disposable restore verification and deliberately confirmed restore scripts provide a documented recovery path. Run `pnpm verify:m17` for the machine-readable checklist. See [docs/m17-security-and-recovery.md](docs/m17-security-and-recovery.md) for controls, commands, recovery targets and production limitations.

## Production deployment

M18 provides production Docker targets for the web, API and worker; private persistent PostgreSQL and Redis services; automatic HTTPS through Caddy; startup migrations; an idempotent fictional demonstration seed; and static, database and public-URL verifiers. Run `pnpm verify:m18` to validate the deployment package. See [docs/m18-deployment-and-demo-data.md](docs/m18-deployment-and-demo-data.md) for the server, DNS, SMTP, seed and live-verification procedure.

The verified public deployment is available at [mirai-tracker.vercel.app](https://mirai-tracker.vercel.app). It uses a same-origin `/api` proxy, managed Neon PostgreSQL, Upstash Redis, two five-minute QStash schedules and Brevo SMTP. All 11 static and 5 live M18 checks pass; SMTP acceptance evidence is recorded in `docs/evidence/m18-smtp-verification.json`.

## What-if recovery planner

M20 turns a warning into an explainable intervention plan. Managers and faculty can choose a TIGHT or ON TRACK target, see DANGER subjects first, calculate the minimum additional capacity in half-hour units, test proposed hours, then print or download a spreadsheet-safe CSV. The scenario is read-only and uses each subject's existing M10 thresholds. Run `pnpm verify:m20`; see [docs/m20-stretch-features.md](docs/m20-stretch-features.md) for formulas, safeguards and evidence.

## Administrator UI redesign

The first editable Figma administrator overview, interface content rules and implementation tracker are in [docs/admin-ui-redesign.md](docs/admin-ui-redesign.md).

## Workspace

```text
apps/web                 React interface
apps/api                 NestJS REST API
apps/worker              BullMQ background jobs
packages/calculations    Official hour-weighted calculation functions
packages/validation      Shared Zod validation schemas
docs                     Architecture and milestone notes
```

Real credentials belong in `.env`, which is excluded from Git. Never commit passwords, tokens or API keys.
