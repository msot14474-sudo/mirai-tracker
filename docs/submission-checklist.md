# Submission Checklist

## Included and verified

- [x] Source code for React web, NestJS API, worker and shared packages
- [x] README with setup, verification, feature and deployment guidance
- [x] Architecture diagrams and trust boundaries
- [x] Design document covering users, workflows, data, calculations, security and scaling
- [x] Test Report with results, methods and honest limitations
- [x] Ten-minute demonstration script and fallback plan
- [x] Prisma schema and committed PostgreSQL migrations
- [x] Fictional idempotent demonstration seed
- [x] M10 hand-calculation CSV
- [x] M11-M14 interface screenshots
- [x] M16 JSON/CSV load-test evidence and k6 scenario
- [x] M17 JSON/CSV security checklist
- [x] M18 JSON/CSV deployment-package checklist
- [x] Public M18 Vercel deployment with managed PostgreSQL and Redis
- [x] Authenticated five-minute QStash alert schedules
- [x] Brevo SMTP delivery accepted from the production application
- [x] Password plus email-OTP authentication with expiring, rate-limited challenges
- [x] Combined 18-page PDF submission report
- [x] No committed `.env`, password, token or API key
- [x] M20 read-only recovery planner with CSV/print output and feature tests
- [x] M20 applied-scenario interface screenshot
- [x] `pnpm check`: 243 tests, all type checks and builds pass

## Must be completed before claiming a fully live submission

- [ ] Confirm the college submission deadline, naming convention and demonstration date
- [x] Select the deployment account and publish the Vercel production domain
- [x] Configure and verify the deployer's SMTP account
- [x] Run production Docker image, migration, seed and readiness checks
- [x] Record the M18 HTTPS URL and run `pnpm verify:m18:live`
- [x] Run PostgreSQL integration tests
- [ ] Run the disposable production restore drill
- [ ] Run the authenticated M16 test against the deployed stack
- [ ] Time five faculty volunteers on phones and run `pnpm study:m09`
- [ ] Obtain approval before using any real institutional data
- [ ] Replace or disable the shared demonstration password after assessment

## Final archive structure

```text
Mirai-Tracker/
  README.md
  SUBMISSION.md
  apps/
  packages/
  docker/
  docs/
    architecture.md
    design-document.md
    test-report.md
    demo-script.md
    submission-checklist.md
    submission/
      Mirai_Tracker_Submission_Report.pdf
    evidence/
  performance/
  scripts/
  docker-compose.yml
  docker-compose.production.yml
  .env.example
  .env.production.example
```

Exclude `.env`, `.env.production`, `node_modules`, build output, backups and real data. Open the final archive on a clean machine before submission and run `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm verify:m19`.
