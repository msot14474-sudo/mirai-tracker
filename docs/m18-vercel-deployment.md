# M18 Vercel deployment

Mirai Tracker deploys from one GitHub monorepo as two Vercel projects:

| Project             | Root directory | Purpose                                    |
| ------------------- | -------------- | ------------------------------------------ |
| `mirai-tracker-api` | `apps/api`     | NestJS API deployed as one Vercel Function |
| `mirai-tracker`     | `apps/web`     | React/Vite static frontend                 |

Vercel automatically includes workspace packages outside each root directory for
pnpm monorepos. Keep that setting enabled for the API because it imports
`@mirai/calculations`.

## Managed services

- Provision a serverless PostgreSQL database through the Vercel Marketplace and
  connect it to the API project as `DATABASE_URL`.
- Provision Upstash Redis and expose its TLS connection string as `REDIS_URL`.
- Configure a transactional SMTP provider using the variables in
  `apps/api/.env.vercel.example`.
- Generate independent `SESSION_SECRET` and `INTERNAL_JOB_SECRET` values. Never
  store either value in Git.

## Database initialization

After connecting PostgreSQL, pull the API project's production environment and
apply the committed migrations:

```sh
vercel env pull .env.vercel.production --environment=production
pnpm --filter @mirai/api exec prisma migrate deploy
```

Run the seed only when the college has chosen its initial accounts and temporary
password policy. Do not add `DEMO_USER_PASSWORD` to the Vercel environment.

## Five-minute alert processing

A Vercel Hobby cron can run only once per day. M14 requires scans every five
minutes, so production uses two Upstash QStash schedules instead of starting the
BullMQ process in `apps/worker`:

1. POST `/missed-log-alerts/process-due` every five minutes with body
   `{"stage":"FACULTY_MISSED_LOG"}`.
2. POST the same endpoint every five minutes with body
   `{"stage":"CAMPUS_MANAGER_ESCALATION"}`.
3. Both requests send `Content-Type: application/json` and
   `x-internal-job-secret: <INTERNAL_JOB_SECRET>`.

The Docker deployment continues to run the BullMQ worker locally and on hosts
that support permanent processes.

## Release order

1. Deploy the API after setting its environment variables.
2. Apply database migrations and verify `/health/live` and `/health/ready`.
3. Deploy the web project with `VITE_API_URL` set to the API production URL.
4. Set `WEB_ORIGIN` to the web production URL and redeploy the API.
5. Configure QStash and SMTP, then run the live M18 verification.

For the split Vercel deployment, verify the public web and API domains together:

```sh
M18_DEMO_URL='https://mirai-tracker.vercel.app' \
M18_API_URL='https://mirai-tracker-api.vercel.app' \
M18_DEMO_EMAIL='admin@mirai.local' \
M18_DEMO_PASSWORD='<temporary-demo-password>' \
pnpm verify:m18:live
```

`M18_API_URL` is optional for the original same-origin Docker deployment.

## Verified production result

The production deployment was verified on 8 October 2026:

- `https://mirai-tracker.vercel.app` serves the public React application and proxies `/api` to the NestJS deployment;
- managed Neon PostgreSQL and Upstash Redis pass dependency readiness;
- the seeded Program Manager can sign in and read campus and progress data;
- two authenticated QStash schedules process both missed-log stages every five minutes; and
- Brevo SMTP accepted an authenticated application test message.

The public and SMTP evidence is stored in `docs/evidence/m18-deployment-checklist.json` and `docs/evidence/m18-smtp-verification.json`. No SMTP key, session secret or background-job secret is stored in Git.
