# M16 — Performance and scalability

M16 implements the exact Problem 1 scalability checks:

- support a deployment target of 4 campuses, 60+ faculty, 30+ subjects and 1,000+ students;
- keep the end-of-day session-logging spike below 1 second at p95;
- load a full-semester dashboard below 2 seconds;
- report p95 latency and error rate at 50, 100 and 200 concurrent users.

## Reproducible test paths

The Node 20 runner at `scripts/m16-load-test.mjs` uses real HTTP requests and runs two independent waves at every concurrency level:

1. `GET /progress/dashboard?asOf=2026-10-08`
2. `POST /session-logs/sessions/:sessionId/logs`

Each virtual user performs three sequential requests while all virtual users start together. That produces 150, 300 and 600 measurements per endpoint at 50, 100 and 200 users: 2,100 timed requests in total. A warm-up request is excluded from every measured path. Each body is fully consumed before its latency is recorded.

The repository also includes `performance/m16-load-test.k6.js` for a standard k6 run using the same endpoints, user levels, iterations and thresholds. k6 is optional; the dependency-free Node runner generated the committed local evidence.

## Measured local baseline

Run date: 8 October 2026. Target: local demo API on `127.0.0.1:3000`. Runtime: Node 20 on Apple Silicon. The measured dashboard contained 30 subjects rolled up across four campuses and two tracks.

| Path            | Concurrent users | Requests |      p50 |      p95 |       p99 | Errors | Required threshold | Result |
| --------------- | ---------------: | -------: | -------: | -------: | --------: | -----: | -----------------: | ------ |
| Dashboard       |               50 |      150 |  2.76 ms | 37.38 ms |  40.78 ms |  0.00% |     p95 < 2,000 ms | Pass   |
| Session logging |               50 |      150 |  7.49 ms | 10.90 ms |  11.31 ms |  0.00% |     p95 < 1,000 ms | Pass   |
| Dashboard       |              100 |      300 |  9.14 ms | 52.18 ms |  58.56 ms |  0.00% |     p95 < 2,000 ms | Pass   |
| Session logging |              100 |      300 | 12.39 ms | 15.42 ms |  16.03 ms |  0.00% |     p95 < 1,000 ms | Pass   |
| Dashboard       |              200 |      600 | 36.37 ms | 78.73 ms | 134.75 ms |  0.00% |     p95 < 2,000 ms | Pass   |
| Session logging |              200 |      600 | 25.19 ms | 29.99 ms |  33.73 ms |  0.00% |     p95 < 1,000 ms | Pass   |

The machine-readable source of truth is [m16-load-test-results.json](evidence/m16-load-test-results.json). [m16-load-test-results.csv](evidence/m16-load-test-results.csv) is ready for the final Test Report or a spreadsheet chart.

## Run it

Start the application, then run:

```bash
pnpm load:m16
pnpm verify:m16
```

The verifier fails when any required scenario/level is missing, the request count is wrong, dashboard p95 reaches 2 seconds, logging p95 reaches 1 second, or the error rate exceeds 1%.

For a real authenticated API, keep credentials outside the repository:

```bash
MIRAI_LOAD_URL=https://your-api.example \
MIRAI_LOAD_COOKIE='mirai_session=...' \
MIRAI_LOAD_SESSION_IDS='uuid-1,uuid-2,uuid-3' \
MIRAI_LOAD_ENVIRONMENT=staging \
pnpm load:m16
```

Use session IDs assigned to the faculty identity represented by the cookie. No password, session cookie or API key is written into the JSON/CSV report.

The matching k6 command is:

```bash
MIRAI_LOAD_URL=http://127.0.0.1:3000 k6 run performance/m16-load-test.k6.js
```

## Runtime visibility

The API now adds two timing headers to every response:

```text
Server-Timing: app;dur=12.34
X-Response-Time: 12.34ms
```

`Server-Timing` is exposed through CORS, so browser developer tools can separate application time from client/network time. The load report still uses full client-observed latency, which is the stricter user-facing measurement.

## Capacity foundations

The data model scopes all high-volume records instead of keeping a single global list. Relevant indexes include faculty/date and offering/date on scheduled sessions, batch/status and target date on offerings, offering/calculation date on snapshots, and status/date on alerts. Dashboard and session-log permissions narrow queries before calculation or mutation.

The target deployment profile is recorded in every report: four campuses, 60 faculty, 30 subjects and 1,000 students. PostgreSQL stores these as ordinary rows with indexed foreign keys; Redis stores short-lived sessions and BullMQ state rather than academic history.

## Interpretation and production rerun

The committed results are a repeatable local baseline against the functional demo API, including the expanded four-campus/30-subject dashboard payload. They establish that the browser/API contract and test harness meet the thresholds without network delay.

They do not claim production-database capacity because Docker/PostgreSQL/Redis are not available on this machine. After M18 deployment, rerun the same command against staging with real authenticated session IDs and keep that report beside this baseline. The deployed result will include PostgreSQL query time, Redis session lookup, TLS and network latency without changing the acceptance logic.
