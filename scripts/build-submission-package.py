"""Build the dated submission documents from measured evidence, never invented results."""
from pathlib import Path
import json, csv, statistics, re, html, shutil
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
from reportlab.graphics import renderSVG, renderPDF

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/2026-10-20"
OUT = ROOT / "docs/submission"
OUT.mkdir(exist_ok=True)
load = json.loads((EVIDENCE / "load-results.json").read_text())
calc = json.loads((EVIDENCE / "calculation-reconciliation.json").read_text())
demo = json.loads((EVIDENCE / "live-demo-data.json").read_text())
db = json.loads((EVIDENCE / "database-tests.json").read_text())
assert all(x["exitCode"] == 0 for x in db)
assert all(x["pass"] for x in load["permissions"])
assert all(x["pass"] for x in calc["rows"])
def save(path, text): (ROOT / path).write_text(text.strip()+"\n")
def table(headers, rows):
    return "\n".join(["| "+" | ".join(headers)+" |","| "+" | ".join(["---"]*len(headers))+" |"]+["| "+" | ".join(map(str,r))+" |" for r in rows])
def hours(v): return f"{v:.2f}"
total = lambda key: sum(c[key] for c in demo["campuses"])
loadrows = [[x["concurrentUsers"],x["dashboard"]["requests"]+x["logging"]["requests"],hours(x["dashboard"]["p95Ms"]),hours(x["logging"]["p95Ms"]),f'{100*(x["dashboard"]["errors"]+x["logging"]["errors"])/(x["dashboard"]["requests"]+x["logging"]["requests"]):.2f}%'] for x in load["load"]]
with (EVIDENCE/"load-results.csv").open("w",newline="") as f:
    w=csv.writer(f);w.writerow(["Concurrent users","Requests","Dashboard p95 ms","Logging p95 ms","Error rate"]);w.writerows(loadrows)
burst=load["endOfDayBurst"]
timings=load["automatedLoggingFlows"]
median=statistics.median(x["seconds"] for x in timings)
environment=load["environment"]

save("README.md", f"""
# Mirai Course Progression Tracker

[Live application](https://mirai-tracker.vercel.app) · [Submission files](SUBMISSION.md) · [Test report](docs/test-report.md) · [Scalability report](docs/scalability-report.md)

Mirai Tracker connects semester calendars, batch timetables, lesson plans, teaching logs and exam readiness across **HI-Tech, Jaggannath and Rathinam**. A batch can contain subjects in both the **Mirai and University tracks**.

![System architecture](docs/architecture.svg)

## Populated demonstration

Choose **Evaluator Demo · Odd Semester 2026** in any campus. Each has five fictional faculty, five subjects, a student batch, calendar, timetable, lesson plans, teaching history, two exams and visiting-faculty accounting. The live seed contains **{total('topics')} topics, {total('sessions')} dated classes and {total('logs')} lecture logs**.

Start with Subjects → a demo subject, then inspect Reports, Progress, Exam readiness and Visiting faculty. Faculty see assigned subjects; students see their enrolled batch without edit controls. [Evaluator guide](docs/evaluator-guide.md)

Existing institutional records remain separate. Passwords and OTP destinations are in the owner's private handoff file, not this repository. Local setup generates independent credentials.

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

| Role | Access |
| --- | --- |
| Administrator / Program Manager | All campuses; semester setup, calendar import, subjects, access, reports, progress, notifications, exams and exports |
| Campus Manager | Assigned campus; subjects, calendar/exam edits, batch timetables, extra classes, faculty/student access, reports and visiting-faculty expenses |
| Faculty | Assigned subjects; lesson plans, planned dates, daily logs, own teaching reports, notifications and subject analysis |
| Student | Read-only subjects, teachers, coverage, upcoming classes and exams for the enrolled batch |

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

| Default ratio | Status |
| --- | --- |
| ≥ 1.15 | ON TRACK |
| ≥ 1.00 and < 1.15 | TIGHT |
| < 1.00 | DANGER |

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

Database integration tests use disposable databases. Never point them or the loopback-only load harness at production. Five fictional-account logging timings are automated API measurements, not human phone observations.

## Architecture and operations

React/Vite PWA and NestJS API run on Vercel behind a same-origin `/api` proxy. Supabase PostgreSQL stores relational data; Upstash Redis stores sessions and transient state. QStash invokes protected scheduled jobs. SMTP, AI and WhatsApp are external integrations. Local Compose uses PostgreSQL, a BullMQ worker and Mailpit.

| Directory | Purpose |
| --- | --- |
| apps/web | React interface |
| apps/api | NestJS, Prisma, authorization and domain services |
| apps/worker | BullMQ background jobs |
| packages/calculations | Shared academic calculations |
| packages/validation | Shared validation |
| docs/submission | Downloadable reports and calculation workbook |
| docs/evidence/2026-10-20 | Current measured evidence |

[Design](docs/design-document.md) · [Architecture source](docs/architecture.mmd) · [Backup/recovery](docs/m17-security-and-recovery.md)

Secrets, local evaluator credentials and `outputs/` are excluded from Git and image build contexts. Earlier milestone documents are historical; this README and the dated submission reports describe the current product.
""")

save("docs/test-report.md", f"""
# Test report

Mirai Course Progression Tracker. Evidence date: 20 October 2026. Code baseline: 43ea893 plus the submission packaging and demo-label changes recorded in Git.

## Scope and outcome

The test scope covers administrator, program manager, campus manager, faculty and student access; calendar/timetable propagation; lesson plans and logs; calculations; exams; reports; notifications; imports; and scale. The requested deployment has three campuses: HI-Tech, Jaggannath and Rathinam.

{table(["Evidence","Result"],[
["Unit/component tests","615 passed: API 427, web 157, calculations 23, worker 6, validation 2"],
["PostgreSQL integrations","27 passed across six suites"],
["Authenticated HTTP permissions","11 passed using password and Mailpit OTP"],
["Independent calculations","18 of 18 numeric comparisons match to two decimals"],
["Concurrent load","50, 100 and 200 users, zero HTTP/payload errors"],
["Live demonstration",f"3 campuses, {total('faculty')} faculty, {total('subjects')} subjects, {total('logs')} lecture logs"],
])}

A regression check also verifies that a larger semester download can complete beyond the normal 15-second read deadline; downloads have a bounded 60-second budget.

The two stale integration fixtures were updated for Mirai/University terminology and the new buffer-threshold context. Their affected suite then passed against a fresh migrated database.

## Roles and permissions

{table(["Role","Check","Outcome"],[[x["role"].replace("_"," ").title(),x["name"],f'HTTP {x["actualStatus"]}; passed'] for x in load["permissions"]])}

Additional database integrations exercise scoped reports/exports, campus calendar edits, bulk access, manual semester-to-subject linkage and AI conversation ownership. A student's controller is read-only. Faculty are blocked from another faculty member's subject and log route, including direct API attempts.

## Calculation accuracy

Expected values are independently summed from topic and future-session database rows, then compared with the authenticated dashboard API. The expected calculation does not call the shared analytics helper. The accompanying Excel workbook exposes the formulas and the saved API values.

{table(["Subject","Coverage %","Remaining h","Available h","Buffer","Result"],[[r["subject"].replace(" (Demo)",""),hours(r["actual"]["coveragePercentage"]),hours(r["actual"]["remainingHours"]),hours(r["actual"]["availableHours"]),hours(r["actual"]["bufferRatio"]),"Match"] for r in calc["rows"]])}

Scope, covered hours, coverage percentage, remaining hours, available hours and buffer ratio are all checked. The earlier hand-worked CSV separately exercises ON TRACK, TIGHT and DANGER. Threshold boundaries use raw ratios before display rounding.

## Calendar and exam evidence

Calendar-engine tests select exactly the second and fourth Saturdays across three months, reject fifth Saturdays, and apply explicit holiday/working-day overrides. Schedule-engine tests show every affected later topic shifting after cancellation or a missing holiday slot. Service tests check regeneration after holiday creation, editing, deletion and semester-rule changes.

Recovery tests reject closed dates and conflicts, preserve logged history and prevent already-resolved cancellations from moving again. Exam tests calculate only mapped topics, compare mid-term/end-term scopes and enforce deadlines. The live demo has two scoped exam windows per campus.

## Logging and alerts

{table(["Fictional account","Measured automated flow (seconds)","Result"],[[x["account"],hours(x["seconds"]),"Passed"] for x in timings])}

Median automated list-and-save time: **{median:.2f} seconds**. These are five fictional-account HTTP workflows with actual timings. They measure API responsiveness, not human reading, typing or phone usability; no human-volunteer timing is claimed.

Alert tests verify end-of-campus-day faculty reminders, the exact 48-hour escalation boundary, deduplication, retries and cancellation of pending messages after logging. SMTP behavior is tested with local capture or mocks. External delivery is not inferred from those tests.

## Imports and connected workflows

The current interface has separate calendar, batch timetable, lesson-plan and student-access imports. Parser and service tests cover row preservation, invalid dates, partial plans, worksheet selection, errors and relationships. The retired full-semester backend importer has an integration test; that is not a claim that the removed interface is available.

The full scale seed is loaded through a dedicated additive evaluator script, not a CSV import. Thus the large-dataset exercise proves storage and application behavior with 30 subjects, not a 30-subject CSV import acceptance result.

## Load and live data

{table(["Clients","Requests","Dashboard p95 ms","Logging p95 ms","Error rate"],loadrows)}

The separate burst used 60 distinct authenticated faculty, one submission each: p95 **{burst['logging']['p95Ms']:.2f} ms**, {burst['logging']['errors']} errors. All completed in {burst['seconds']:.2f} seconds. This is a simultaneous burst within the requested 15-minute window, not a sustained 15-minute soak.

The live additive seed preserves existing records and provides {total('topics')} topics, {total('sessions')} classes, {total('logs')} logs, {total('exams')} exams and {total('calendarOverrides')} dated overrides. Demo notifications and calculated weekly previews make their respective interfaces inspectable. Visiting-faculty rates, expenses and payments are fictional examples.

## Reproduction and evidence boundaries

Run `pnpm test`, the six files in `apps/api/test` using `jest.database.config.cjs` against disposable migrated databases, and the scripts `submission-load-test.mjs` and `submission-calculations.mjs` with private local manifests. The seed script has a local scale profile and a separately guarded live demo profile.

Evidence is stored in `docs/evidence/2026-10-20`. Load measurements include response-body validation and real HTTP authentication, PostgreSQL and Redis. Browser layout is checked separately; API timing does not measure page paint. Production capacity, a sustained soak, external WhatsApp delivery and human phone-task duration are outside these measured results.
""")

save("docs/scalability-report.md", f"""
# Scalability and load report

Measured on {load['startedAt']}. Three campuses are used as requested.

## Dataset and environment

{table(["Item","Configuration"],[
["Academic dataset","3 campuses; 60 faculty; 30 subjects; 1,020 students; full semester relations"],
["Host",f"{environment['cpu']}; {environment['logicalCpus']} logical CPUs; {environment['memoryGiB']} GiB RAM"],
["Runtime",f"{environment['node']}; {environment['platform']}"],
["Persistence","Real PostgreSQL 16 and Redis 7; Prisma connection pool 10"],
["Authentication","68 accounts authenticated through password and Mailpit email OTP"],
["Network","Loopback HTTP; production Vercel/Supabase latency is not represented"],
])}

The supported setup runtime is Node 22.13+. This measurement run used the available Node 20.18.0 host runtime; reproduce on the supported runtime before comparing deployment capacity.

## Workload

Each virtual user performs three sequential dashboard-read/log-write pairs. Virtual users run concurrently. Ten percent of dashboard readers use the administrator's full 30-subject scope; the remainder use assigned faculty scope. Writes use distinct class identifiers within each level and create real log revisions. Authentication is completed before timed load.

This is a short burst benchmark. It measures client-observed HTTP completion including JSON parsing. Success requires both the expected status and payload shape. It does not use the earlier mocked demo API benchmark.

{table(["Clients","Requests","Dashboard p95 ms","Logging p95 ms","Error rate"],loadrows)}

## Target checks

The 60-distinct-faculty burst recorded p95 logging latency of **{burst['logging']['p95Ms']:.2f} ms**, below the 1,000 ms target, with zero errors. All 60 submissions completed in {burst['seconds']:.2f} seconds, inside the 15-minute window.

Five sequential administrator dashboard requests across all 30 subjects recorded p95 **{load['fullSemesterDashboard']['p95Ms']:.2f} ms**, below the 2,000 ms API target. Mixed-load dashboard p95 remained below 2,000 ms at every level. Browser rendering and internet transit are not included.

At 100 and 200 concurrent mixed-load clients, logging p95 exceeds 1,000 ms. The results establish the observed local limit rather than claiming every stress level meets that latency target. All requests still completed without HTTP or payload errors.

## Scaling plan

Keep PostgreSQL and Redis external to stateless API instances. Match connection pools to the database's total connection budget; adding replicas without budgeting connections can worsen queueing. Move long AI/file work and scheduled email processing away from interactive requests.

Profile the class-context queries and transaction wait time first under heavy logging. Cache or preaggregate dashboard results only with campus/subject permission keys and invalidation on logs, plans, calendars and assignments. Retain strong transaction boundaries and conflict checks.

For a hosted capacity claim, rerun the same authenticated workload on an isolated staging deployment with production-equivalent Vercel limits, Supabase region/tier and Upstash configuration. Add a sustained 15-minute run, cold-start samples and browser page-load measurements. Track p50/p95/p99, error rates, database connections and slow queries.

## Reproduction

Create a fresh migrated local database, run `apps/api/prisma/seed-evaluator.ts` with `EVALUATOR_PROFILE=scale`, start the API, then run `node scripts/submission-load-test.mjs <private-env.json> <private-accounts.json>`. The script rejects a remote database target. Results and CSV are committed without credentials.
""")

design = """
# Architecture and design

## Purpose and scope

Mirai Tracker connects planning to recorded teaching for HI-Tech, Jaggannath and Rathinam. A semester belongs to a campus. A batch contains offerings in Mirai and University tracks. Shared records drive dashboards, reports, faculty plans and the student view.

## Deployment

React/Vite serves the PWA from Vercel. Same-origin /api requests reach NestJS on Vercel. Prisma accesses Supabase PostgreSQL. Upstash Redis stores opaque sessions and transient auth/job state. QStash invokes protected scheduled endpoints. SMTP delivers OTPs and summaries; AI and WhatsApp are separately configured providers.

Local Compose runs the web, API, PostgreSQL, Redis, Mailpit and BullMQ worker. The load report uses a host API with local containerized data services. It does not claim to reproduce hosted network latency.

## Data and authorization

Users have campus-scoped roles. Faculty profiles link to offerings through dated assignments. Students link to a batch. Campus → semester → batch → offering → lesson plan → unit → topic forms the academic hierarchy. Timetable entries generate sessions; revisioned logs record topic updates. Exam windows map to exact topics.

Administrators/program managers oversee all campuses. Campus managers manage their campuses. Faculty work with assigned subjects. Students read their enrolled batch. Server-side guards and row scoping apply to reads, writes, reports, exports and AI context.

## Calculation and calendar

Topic minutes are canonical. Covered minutes include completed topics and weighted partial completion. Remaining minutes equal scope minus covered minutes. Available minutes come from eligible future sessions through the deadline. Buffer is available divided by remaining. Default thresholds are 1.15 for ON TRACK and 1.00 for TIGHT; complete and missing-plan states are distinct.

Explicit calendar entries override weekly rules. Sundays and non-working Saturdays are excluded unless opened. Timetable generation checks conflicts and preserves logged history. Changes produce revised planned dates; affected classes can require faculty review before a recovery move.

## Imports, delivery and reports

CSV/XLSX rows are parsed, validated and previewed before domain writes. AI helps with unstructured calendars and ambiguous mappings. Separate pages import calendars, batch timetables, lesson plans and student access. The full-semester import interface is retired.

Logs record completion, classwork/homework and topic changes. Reports use shared scoped analytics. Exports retain structured records. Visiting-faculty honoraria derive from recorded classes and effective per-class rates, with expenses/payments shown separately.

## Security and operations

Passwords use salted scrypt. OTPs expire after ten minutes with attempt/request limits. Session cookies are HTTP-only, SameSite and Secure in production. Authorization is refreshed from PostgreSQL. Validation, origin checks and safe errors protect mutations. AI receives scoped data and output is rendered without raw HTML execution.

Transactions protect related writes. Unique job/revision keys and leases reduce duplicate processing. Scheduler secrets protect internal routes. Audit records retain actor and scope. Secrets and demo passwords stay outside Git and Docker build contexts.

The scale fixture contains three campuses, 60 faculty, 30 subjects and 1,020 students. The separate report records 50/100/200-client loads, a 60-faculty burst and full-semester reads. Pool budgeting, permission-safe aggregation and hosted sustained tests guide further scaling.
"""
save("docs/design-document.md",design)
save("docs/evaluator-guide.md", """
# Evaluator walkthrough

In any campus choose **Evaluator Demo · Odd Semester 2026**, 20 July–18 December. Subject names end in “(Demo)” and the batch is “Evaluator First Year A”. All history and financial examples are fictional.

## Administrator

1. Open each of the three campuses and inspect Overview and Subjects.
2. Select a demo subject: review its teacher, scheduled/taught classes, syllabus, plan, hours and buffer.
3. Open Reports and inspect Course Progress, Teaching Delivery, Faculty Activity, Exam Readiness and Campus & Track.
4. In Semester setup inspect holidays, second/fourth Saturdays and the two exams.
5. Open Notifications and AI insights. Calculated demo weekly previews are labelled; AI can analyze the current saved records.
6. Open Visiting faculty for Professional Communication: inspect class counts, per-class rate, travel expense and payment.
7. Open Full semester export and choose the evaluator semester.

## Campus manager

Use evaluator.<campus>.manager@mirai.local, where campus is hitech, jaggannath or rathinam. Only that campus is available. Inspect the full batch timetable, recurring edits and extra-class control. Calendar and exam-window edits remain campus-scoped.

## Faculty

Use evaluator.<campus>.faculty1@mirai.local through faculty5. Their subjects are Data Structures, Web Development, Database Systems, Discrete Mathematics and Professional Communication respectively. The fifth teacher is visiting faculty.

Review allocated hours, the 30-topic plan, planned dates, exam syllabus and own teaching reports. Daily logging includes real saved synthetic history. Save a log in the demo semester and check that teaching delivery and progress refresh.

## Student

Use evaluator.<campus>.student1@mirai.local. Inspect the five subjects in the enrolled batch, their teachers, coverage, next classes and exams. No editing or lecture-feedback control should appear.

## Demonstration edits

Use only the evaluator semester. Record a value before editing a holiday, exam window or timetable hour and restore it afterward. Logged class history should remain intact. Live credentials are in the owner's private access file; local setup uses Mailpit. Configured external providers are required to demonstrate actual email/WhatsApp delivery.
""")
save("docs/demo-script.md", """
# Five-minute video outline

| Time | Demonstration |
| --- | --- |
| 0:00–0:35 | Introduce three campuses, roles and the live overview |
| 0:35–1:20 | Show evaluator semester, calendar rules, exams and subjects |
| 1:20–2:05 | Campus manager: batch timetable, hour edit and extra class |
| 2:05–2:55 | Faculty: allocated hours, lesson plan, planned dates and daily log |
| 2:55–3:35 | Coverage, buffer ratio, exam scope and teacher-reviewed recovery |
| 3:35–4:10 | Reports, delivery history, notifications and visiting-faculty costs |
| 4:10–4:30 | Read-only student view |
| 4:30–5:00 | README, architecture, calculation workbook and measured load results |

Use the fictional evaluator semester throughout. Prepare role sessions before recording. Describe automated timing measurements as automated results. The project owner will produce the video.
""")
save("docs/submission-checklist.md", """
# Submission checklist and judging evidence

| Deliverable | Evidence |
| --- | --- |
| Root README and one-command setup | README.md and scripts/setup-demo.sh |
| Live demo | https://mirai-tracker.vercel.app |
| Architecture and design ≤3 pages | docs/submission/Architecture_and_Design.pdf |
| Separate diagram | docs/architecture.svg and docs/architecture.mmd |
| Three-campus populated sample | docs/evidence/2026-10-20/live-demo-data.json |
| Test report and load results | docs/submission/Test_Report.pdf and Scalability_Report.pdf |
| Five-minute video | Owner-produced; recording outline supplied |

| Judging criterion | Weight | Evidence |
| --- | --- | --- |
| Calculations and calendar | 25% | Independent Excel/API reconciliation; calendar and propagation tests |
| Faculty logging experience | 20% | Responsive logging UI; five automated account flows; actual request timings |
| Dashboard clarity and warnings | 20% | Subject analytics, configurable buffer ratio, scoped reports and notifications |
| Exam readiness and student view | 10% | Exact exam-topic scope; read-only batch view; permission tests |
| Testing depth and scale | 15% | 615 automated tests, 27 database tests, 11 HTTP permission checks, concurrent loads |
| Code and documentation | 10% | Root README, source layout, one-command setup, design and reproducible scripts |

The user's three-campus instruction overrides the four-campus examples. Automated account timings do not establish the original five-human phone-study criterion. The large seed is not presented as a CSV-import test. These distinctions preserve the meaning of the measured evidence.
""")
save("SUBMISSION.md", """
# Submission package

Live demo: https://mirai-tracker.vercel.app

| Deliverable | File |
| --- | --- |
| Setup and product documentation | [Root README](README.md) |
| Test report | [PDF](docs/submission/Test_Report.pdf), [source](docs/test-report.md) |
| Scalability and load report | [PDF](docs/submission/Scalability_Report.pdf), [source](docs/scalability-report.md) |
| Architecture and design | [PDF](docs/submission/Architecture_and_Design.pdf), [source](docs/design-document.md) |
| Separate architecture diagram | [SVG](docs/architecture.svg), [Mermaid](docs/architecture.mmd) |
| Calculation workbook | [Excel](docs/submission/Calculation_Verification.xlsx) |
| Load results | [JSON](docs/evidence/2026-10-20/load-results.json), [CSV](docs/evidence/2026-10-20/load-results.csv) |
| Live demo inventory | [JSON](docs/evidence/2026-10-20/live-demo-data.json) |
| Evaluator walkthrough | [Guide](docs/evaluator-guide.md) |
| Video outline | [Five-minute script](docs/demo-script.md) |
| Judging evidence | [Checklist](docs/submission-checklist.md) |

Three campuses are used as requested. Demo academic history is fictional and labelled. Test figures are measured. Live passwords and OTP destinations remain in a separate private handoff file.
""")

# Repository-native diagram, independently downloadable as SVG.
d=Drawing(1000,470)
navy=colors.HexColor("#17386B");blue=colors.HexColor("#EAF1FF");gray=colors.HexColor("#5E708C")
nodes=[
 (25,315,210,90,"Web PWA","React / Vite · Vercel"),
 (290,315,235,90,"NestJS API","Permissions · domain services"),
 (600,350,190,65,"Supabase PostgreSQL","Academic records · Prisma"),
 (600,245,190,65,"Upstash Redis","Sessions · transient state"),
 (25,140,210,90,"QStash schedules","Protected job requests"),
 (290,140,235,90,"External providers","SMTP · AI · WhatsApp"),
 (600,100,340,90,"Local Docker alternative","Postgres · Redis · Mailpit · BullMQ"),
]
for x,y,w,h,title,sub in nodes:
 d.add(Rect(x,y,w,h,rx=12,ry=12,fillColor=blue,strokeColor=colors.HexColor("#B8C9E8")))
 d.add(String(x+15,y+h-28,title,fontName="Helvetica-Bold",fontSize=15,fillColor=navy))
 d.add(String(x+15,y+22,sub,fontName="Helvetica",fontSize=11,fillColor=gray))
def arrow(x1,y1,x2,y2,label,tx,ty):
 d.add(Line(x1,y1,x2,y2,strokeColor=navy,strokeWidth=1.5))
 if x2>x1:d.add(Polygon([x2,y2,x2-9,y2+4,x2-9,y2-4],fillColor=navy,strokeColor=navy))
 else:d.add(Polygon([x2,y2,x2-4,y2-9,x2+4,y2-9],fillColor=navy,strokeColor=navy))
 d.add(String(tx,ty,label,fontName="Helvetica",fontSize=10,fillColor=gray))
arrow(235,360,290,360,"/api",246,372)
arrow(525,375,600,375,"SQL",548,388)
arrow(525,335,600,280,"TLS",550,312)
arrow(235,185,290,320,"Jobs",249,251)
d.add(Line(410,315,410,230,strokeColor=navy,strokeWidth=1.5))
d.add(String(420,265,"Provider APIs",fontName="Helvetica",fontSize=10,fillColor=gray))
d.add(String(25,440,"MIRAI TRACKER · SYSTEM ARCHITECTURE",fontName="Helvetica-Bold",fontSize=18,fillColor=navy))
d.add(String(25,55,"Campus → semester → batch → subject track → offering → plan → session → log → analytics",fontName="Helvetica",fontSize=13,fillColor=navy))
d.add(String(25,28,"All reads, mutations, exports and AI context enforce the caller's role and campus/subject scope.",fontName="Helvetica",fontSize=12,fillColor=gray))
renderSVG.drawToFile(d,str(ROOT/"docs/architecture.svg"))
save("docs/architecture.mmd", """
flowchart LR
  Web["React PWA on Vercel"] -->|Same-origin /api| API["NestJS API on Vercel"]
  API -->|Prisma| DB[("Supabase PostgreSQL")]
  API --> Redis[("Upstash Redis")]
  Jobs["QStash schedules"] -->|Protected jobs| API
  API -.-> SMTP["SMTP"]
  API -.-> AI["AI provider"]
  WhatsApp["WhatsApp webhooks"] -.-> API
  subgraph Local["Local Compose alternative"]
    Worker["BullMQ worker"]
    Mailpit["Mailpit OTP inbox"]
    Postgres[("PostgreSQL")]
    LocalRedis[("Redis")]
  end
""")
save("docs/architecture.md","""# Architecture diagram

![System architecture](architecture.svg)

[Separate SVG](architecture.svg) · [Editable Mermaid](architecture.mmd) · [Design document](design-document.md)

The diagram distinguishes the live Vercel/Supabase/Upstash deployment from the local Docker/BullMQ environment. External providers require their configured credentials.
""")

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyReport",fontName="Helvetica",fontSize=9.5,leading=14,spaceAfter=8,textColor=colors.HexColor("#26364F")))
styles.add(ParagraphStyle(name="SmallReport",fontName="Helvetica",fontSize=8,leading=11))
styles["Title"].textColor=navy;styles["Title"].fontSize=24;styles["Title"].leading=29
styles["Heading2"].textColor=navy;styles["Heading2"].fontSize=13;styles["Heading2"].spaceBefore=12
styles["Heading2"].keepWithNext=True
styles["BodyReport"].allowWidows=0
styles["BodyReport"].allowOrphans=0
def inline(s):
 s=html.escape(s)
 s=re.sub(r"\*\*(.+?)\*\*",r"<b>\1</b>",s)
 s=re.sub(r"`(.+?)`",r"<font name='Courier'>\1</font>",s)
 return s
def render_md(source,dest,diagram=False):
 text=(ROOT/source).read_text().splitlines();story=[];i=0
 while i<len(text):
  line=text[i].strip()
  if not line:i+=1;continue
  if line.startswith("# "):
   story.append(Paragraph(inline(line[2:]),styles["Title"]))
   story.append(Paragraph("MIRAI TRACKER · 20 OCTOBER 2026",styles["SmallReport"]))
   story.append(Spacer(1,12))
   if diagram:
    visual=Drawing(500,235);visual.add(d);visual.scale(.5,.5);story.append(visual);story.append(Spacer(1,12))
  elif line.startswith("## "):story.append(Paragraph(inline(line[3:]),styles["Heading2"]))
  elif line.startswith("|"):
   rows=[]
   while i<len(text) and text[i].strip().startswith("|"):
    parts=[s.strip() for s in text[i].strip().strip("|").split("|")]
    if not all(re.fullmatch(r"[-: ]+",p) for p in parts):rows.append(parts)
    i+=1
   n=len(rows[0]); widths=[(A4[0]-84)/n]*n
   if n==2:widths=[150,A4[0]-234]
   if n==3:widths=[110,290,A4[0]-484]
   if rows[0][0]=="Fictional account":widths=[180,220,A4[0]-484]
   if n==6:widths=[160]+[(A4[0]-244)/5]*5
   grid=Table([[Paragraph(inline(c),styles["SmallReport"]) for c in r] for r in rows],colWidths=widths,repeatRows=1,hAlign="LEFT")
   grid.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),blue),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),("LINEBELOW",(0,0),(-1,0),.7,navy),("LINEBELOW",(0,1),(-1,-1),.3,colors.HexColor("#DCE3EF"))]))
   story+=[grid,Spacer(1,10)];continue
  else:story.append(Paragraph(inline(line),styles["BodyReport"]))
  i+=1
 def footer(c,doc):
  c.setFont("Helvetica",8);c.setFillColor(gray);c.drawString(42,23,"Mirai Tracker · measured submission evidence");c.drawRightString(A4[0]-42,23,str(doc.page))
 SimpleDocTemplate(str(OUT/dest),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=38,bottomMargin=40,title=dest.removesuffix(".pdf").replace("_"," "),author="Mirai Tracker").build(story,onFirstPage=footer,onLaterPages=footer)
render_md("docs/test-report.md","Test_Report.pdf")
render_md("docs/scalability-report.md","Scalability_Report.pdf")
render_md("docs/design-document.md","Architecture_and_Design.pdf",True)
print("Generated README, reports, guide, checklist, architecture and three PDFs from measured evidence.")
