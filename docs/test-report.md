# Test Report

## 1. Result summary

The verified source baseline passes **246 automated tests**, all TypeScript checks and all production application builds. Static evidence also passes the M10 calculation verifier, M16 load thresholds, 13/13 M17 security and recovery controls, 11/11 M18 deployment-package controls and 8/8 M20 stretch-feature controls.

The production Docker smoke test, PostgreSQL integration suite and public Vercel deployment have now passed. The live deployment uses managed PostgreSQL and Redis, authenticated five-minute QStash jobs and verified Brevo SMTP delivery. The five-faculty phone study remains an external activity.

## 2. Automated suite inventory

| Area                           | Framework                |                  Result |
| ------------------------------ | ------------------------ | ----------------------: |
| NestJS API and domain services | Jest                     | 176 passed in 32 suites |
| React interface                | Vitest + Testing Library |   44 passed in 14 files |
| Background worker              | Vitest                   |                6 passed |
| Shared calculations            | Vitest                   |               18 passed |
| Shared validation              | Vitest                   |                2 passed |
| **Total**                      |                          |          **246 passed** |

`pnpm check` runs workspace type checks, tests and production builds. Prisma schema contracts and committed SQL safeguards are included in the API suite.

## 3. Mandatory evidence matrix

| Requirement                                           | Status                           | Evidence                                                                                                       |
| ----------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Three hand-calculated subjects match to two decimals  | Pass                             | M10 CSV and executable verifier; ON TRACK, TIGHT and DANGER all match                                          |
| Holiday shifts affected planned dates                 | Pass                             | Calendar and topic-schedule engine tests                                                                       |
| Cancellation shifts affected planned dates            | Pass                             | Topic-schedule service and engine tests                                                                        |
| Second/fourth Saturdays across three months           | Pass                             | Academic calendar tests                                                                                        |
| Five-faculty median logging time under 60 seconds     | Pending external study           | M09 capture CSV and analyzer are ready; no volunteer times are invented                                        |
| Faculty reminder and 48-hour manager escalation       | Pass in automated boundary tests | M14 engine, service, worker and UI evidence                                                                    |
| Faculty cannot edit another faculty member's subject  | Pass                             | Access-policy and feature-service tests                                                                        |
| Students cannot edit                                  | Pass                             | Student-only GET controller, role guards and interface tests                                                   |
| Mid-term and end-term readiness correct               | Pass                             | M12 calculation and UI tests                                                                                   |
| Three-campus, 25+ subject import without manual fixes | Pass in parser/service tests     | Fictional template validates HI-Tech, Rathinam and Jaggannath with 25 subjects; live PostgreSQL import pending |
| Load at 50, 100 and 200 concurrent users              | Pass on local demo harness       | 2,100 requests, zero errors                                                                                    |
| End-of-day logging p95 below one second               | Pass locally                     | Maximum recorded p95 29.99 ms                                                                                  |
| Full dashboard below two seconds                      | Pass locally                     | Maximum recorded p95 78.73 ms                                                                                  |

## 4. Hand-calculation results

| Subject  | Coverage | Remaining | Available | Buffer |    Pace | Status   |
| -------- | -------: | --------: | --------: | -----: | ------: | -------- |
| CS-DSA   |   58.33% |    2.50 h |    3.00 h |   1.20 | -0.50 h | ON TRACK |
| MATH-101 |   41.67% |    3.50 h |    3.75 h |   1.07 | -0.50 h | TIGHT    |
| PHY-201  |   38.89% |    5.50 h |    4.00 h |   0.73 | -1.00 h | DANGER   |

Skipped time is excluded from PHY-201 scope. The verifier recalculates from integer minutes and compares every displayed value to two decimals.

## 5. Performance results

| Scenario  | Concurrency | Requests |      p50 |      p95 | Errors | Threshold |
| --------- | ----------: | -------: | -------: | -------: | -----: | --------: |
| Dashboard |          50 |      150 |  2.76 ms | 37.38 ms |     0% |  2,000 ms |
| Logging   |          50 |      150 |  7.49 ms | 10.90 ms |     0% |  1,000 ms |
| Dashboard |         100 |      300 |  9.14 ms | 52.18 ms |     0% |  2,000 ms |
| Logging   |         100 |      300 | 12.39 ms | 15.42 ms |     0% |  1,000 ms |
| Dashboard |         200 |      600 | 36.37 ms | 78.73 ms |     0% |  2,000 ms |
| Logging   |         200 |      600 | 25.19 ms | 29.99 ms |     0% |  1,000 ms |

This is a deterministic local API baseline without PostgreSQL, Redis, TLS or network latency. The identical authenticated scenario must be rerun against M18 before making production-capacity claims.

## 6. Security and recovery

M17 verifies production secret rules, protected-by-default routing, role scopes, exact mutation origin, login throttling, audited login, headers, generic errors, loopback local ports, ignored secrets, source scanning, checksummed backups, disposable restore logic and a confirmation-gated real restore. All 13 static and automated controls pass. The live restore drill is pending Docker/PostgreSQL.

## 7. Deployment package

M18's 11 static checks verify private persistent data services, Caddy HTTPS, startup migrations, unprivileged API/worker users, same-origin routing, restart/health policy, secret templates, one-time demo password handling, seed completeness, database verification and SPA headers. The public Vercel deployment at `https://mirai-tracker.vercel.app` passes all five live checks: web availability, API dependency readiness, demonstration login, deployed campus data and populated progress results. Brevo accepted an authenticated production test email, recorded in `docs/evidence/m18-smtp-verification.json`. The package status is `live-verified`.

## 8. Known gaps and risk

| Gap                                      | Impact                                                        | Required close-out                                                      |
| ---------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Production restore drill pending         | Recovery time is not yet measured against the hosted database | Restore a fresh backup into a disposable database and record the result |
| Volunteer study empty                    | Required usability evidence is incomplete                     | Time five faculty on phones and run `pnpm study:m09`                    |
| Hosted M16 load rerun pending            | Local performance evidence excludes public network latency    | Run the authenticated M16 scenario against the Vercel deployment        |
| Real institutional sample data undecided | Demo remains fictional                                        | Obtain approval and import only non-sensitive data                      |

## 9. Stretch-feature evidence

M20's read-only recovery planner ranks DANGER before TIGHT, calculates the exact and half-hour-rounded capacity needed for a selected target, previews the resulting buffer and status, and exports a spreadsheet-safe plan. Seven focused tests cover its formulas, ordering, validation, CSV defence and interaction; 8/8 machine-readable controls pass.

## 10. Reproduction commands

```bash
pnpm check
pnpm verify:m10
pnpm verify:m16
pnpm verify:m17
pnpm verify:m18
pnpm verify:m19
pnpm verify:m20
```

Before final submission, run the disposable restore drill, the authenticated production M16 load test and the five-faculty M09 phone study.
