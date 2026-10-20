# Test report

Mirai Course Progression Tracker. Evidence date: 20 October 2026. Code baseline: 43ea893 plus the submission packaging and demo-label changes recorded in Git.

## Scope and outcome

The test scope covers administrator, program manager, campus manager, faculty and student access; calendar/timetable propagation; lesson plans and logs; calculations; exams; reports; notifications; imports; and scale. The requested deployment has three campuses: HI-Tech, Jaggannath and Rathinam.

| Evidence | Result |
| --- | --- |
| Unit/component tests | 586 passed: API 408, web 147, calculations 23, worker 6, validation 2 |
| PostgreSQL integrations | 27 passed across six suites |
| Authenticated HTTP permissions | 11 passed using password and Mailpit OTP |
| Independent calculations | 18 of 18 numeric comparisons match to two decimals |
| Concurrent load | 50, 100 and 200 users, zero HTTP/payload errors |
| Live demonstration | 3 campuses, 15 faculty, 15 subjects, 540 lecture logs |

A regression check also verifies that a larger semester download can complete beyond the normal 15-second read deadline; downloads have a bounded 60-second budget.

The two stale integration fixtures were updated for Mirai/University terminology and the new buffer-threshold context. Their affected suite then passed against a fresh migrated database.

## Roles and permissions

| Role | Check | Outcome |
| --- | --- | --- |
| Admin | Administrator sees all 30 subjects | HTTP 200; passed |
| Program Manager | Program manager sees all 30 subjects | HTTP 200; passed |
| Campus Manager | Campus manager sees only own 10 subjects | HTTP 200; passed |
| Campus Manager | Campus manager cannot read another campus subject | HTTP 403; passed |
| Faculty | Faculty sees only assigned subject | HTTP 200; passed |
| Faculty | Faculty cannot read another faculty subject | HTTP 403; passed |
| Faculty | Faculty cannot log another faculty class | HTTP 403; passed |
| Student | Student can read own overview | HTTP 200; passed |
| Student | Student cannot log teaching | HTTP 403; passed |
| Student | Student cannot create progress snapshot | HTTP 403; passed |
| Admin | Administrator cannot use faculty logging route | HTTP 403; passed |

Additional database integrations exercise scoped reports/exports, campus calendar edits, bulk access, manual semester-to-subject linkage and AI conversation ownership. A student's controller is read-only. Faculty are blocked from another faculty member's subject and log route, including direct API attempts.

## Calculation accuracy

Expected values are independently summed from topic and future-session database rows, then compared with the authenticated dashboard API. The expected calculation does not call the shared analytics helper. The accompanying Excel workbook exposes the formulas and the saved API values.

| Subject | Coverage % | Remaining h | Available h | Buffer | Result |
| --- | --- | --- | --- | --- | --- |
| Data Structures and Algorithms | 81.67 | 8.25 | 20.00 | 2.42 | Match |
| Web Development | 59.58 | 24.25 | 20.00 | 0.82 | Match |
| Database Systems | 46.33 | 40.25 | 20.00 | 0.50 | Match |

Scope, covered hours, coverage percentage, remaining hours, available hours and buffer ratio are all checked. The earlier hand-worked CSV separately exercises ON TRACK, TIGHT and DANGER. Threshold boundaries use raw ratios before display rounding.

## Calendar and exam evidence

Calendar-engine tests select exactly the second and fourth Saturdays across three months, reject fifth Saturdays, and apply explicit holiday/working-day overrides. Schedule-engine tests show every affected later topic shifting after cancellation or a missing holiday slot. Service tests check regeneration after holiday creation, editing, deletion and semester-rule changes.

Recovery tests reject closed dates and conflicts, preserve logged history and prevent already-resolved cancellations from moving again. Exam tests calculate only mapped topics, compare mid-term/end-term scopes and enforce deadlines. The live demo has two scoped exam windows per campus.

## Logging and alerts

| Fictional account | Measured automated flow (seconds) | Result |
| --- | --- | --- |
| Fictional faculty 1 | 0.07 | Passed |
| Fictional faculty 2 | 0.04 | Passed |
| Fictional faculty 3 | 0.04 | Passed |
| Fictional faculty 4 | 0.04 | Passed |
| Fictional faculty 5 | 0.04 | Passed |

Median automated list-and-save time: **0.04 seconds**. These are five fictional-account HTTP workflows with actual timings. They measure API responsiveness, not human reading, typing or phone usability; no human-volunteer timing is claimed.

Alert tests verify end-of-campus-day faculty reminders, the exact 48-hour escalation boundary, deduplication, retries and cancellation of pending messages after logging. SMTP behavior is tested with local capture or mocks. External delivery is not inferred from those tests.

## Imports and connected workflows

The current interface has separate calendar, batch timetable, lesson-plan and student-access imports. Parser and service tests cover row preservation, invalid dates, partial plans, worksheet selection, errors and relationships. The retired full-semester backend importer has an integration test; that is not a claim that the removed interface is available.

The full scale seed is loaded through a dedicated additive evaluator script, not a CSV import. Thus the large-dataset exercise proves storage and application behavior with 30 subjects, not a 30-subject CSV import acceptance result.

## Load and live data

| Clients | Requests | Dashboard p95 ms | Logging p95 ms | Error rate |
| --- | --- | --- | --- | --- |
| 50 | 300 | 289.92 | 541.93 | 0.00% |
| 60 | 360 | 335.02 | 781.14 | 0.00% |
| 100 | 600 | 570.31 | 1062.91 | 0.00% |
| 200 | 1200 | 1046.38 | 1998.97 | 0.00% |

The separate burst used 60 distinct authenticated faculty, one submission each: p95 **264.86 ms**, 0 errors. All completed in 0.27 seconds. This is a simultaneous burst within the requested 15-minute window, not a sustained 15-minute soak.

The live additive seed preserves existing records and provides 450 topics, 885 classes, 540 logs, 6 exams and 39 dated overrides. Demo notifications and calculated weekly previews make their respective interfaces inspectable. Visiting-faculty rates, expenses and payments are fictional examples.

## Reproduction and evidence boundaries

Run `pnpm test`, the six files in `apps/api/test` using `jest.database.config.cjs` against disposable migrated databases, and the scripts `submission-load-test.mjs` and `submission-calculations.mjs` with private local manifests. The seed script has a local scale profile and a separately guarded live demo profile.

Evidence is stored in `docs/evidence/2026-10-20`. Load measurements include response-body validation and real HTTP authentication, PostgreSQL and Redis. Browser layout is checked separately; API timing does not measure page paint. Production capacity, a sustained soak, external WhatsApp delivery and human phone-task duration are outside these measured results.
