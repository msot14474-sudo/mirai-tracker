# M18 — Deployment and demonstration data

M18 packages Mirai Tracker as a production Docker stack. Caddy is the only public service and obtains HTTPS certificates automatically. Web, API, worker, PostgreSQL and Redis remain on the private Compose network. The web application calls the API through the same origin at `/api`, which keeps cookies and browser-origin checks simple.

## Accounts and infrastructure supplied by the deployer

- A Linux server or VM with Docker Compose, a public IP and ports 80/443 open
- A domain or subdomain whose DNS points to that server
- A real SMTP account for reminder emails

The application creates no hosting, database, domain or email account. PostgreSQL and Redis run inside the deployment by default; they can later be replaced with managed services by changing their URLs.

## Configure

Copy the repository to the server, then create the ignored production environment file:

```bash
cp .env.production.example .env.production
```

Set `APP_DOMAIN`, `APP_ORIGIN`, SMTP details and new independent values for every secret. `APP_ORIGIN` must be the exact HTTPS URL, such as `https://tracker.example.edu`. Use URL-safe database and Redis passwords because they are embedded in connection URLs.

Check the resolved configuration without starting services:

```bash
pnpm deploy:config
pnpm verify:m18
```

## Start and seed

After DNS points to the server:

```bash
pnpm deploy:up
```

The API waits for PostgreSQL and Redis, applies committed migrations, and then starts. Caddy publishes the application only after API and web health checks pass.

Seed the fictional demonstration records once. The password and notification destination exist only in this command's process and are not stored in `.env.production`:

```bash
DEMO_USER_PASSWORD='choose-a-temporary-demo-password' \
DEMO_NOTIFICATION_EMAIL='demo-inbox@example.edu' \
pnpm deploy:seed
pnpm deploy:verify-data
```

The idempotent seed provides one HI-Tech campus, one Mirai batch, a July–December semester, Saturday rules, four calendar overrides, mid-term and end-term windows, two weekly timetable slots, generated dated sessions, one lesson plan, eight topics, progress data and the four demo roles.

Demo emails are `admin@mirai.local`, `campus.manager@mirai.local`, `faculty@mirai.local` and `student@mirai.local`. They are fictional login identifiers and do not create external email accounts. Their `notificationEmail` points to the real demonstration inbox, which receives login OTPs and applicable alerts. Rotate or remove the shared temporary password after the college demonstration.

## Verify the public deployment

Run the live verifier from a trusted machine without saving the password:

```bash
M18_DEMO_URL='https://tracker.example.edu' \
M18_DEMO_EMAIL='admin@mirai.local' \
M18_DEMO_PASSWORD='the-temporary-password' \
pnpm verify:m18:live
```

After password verification, the command prompts for the six-digit code delivered to the demonstration inbox. It verifies HTTPS web health, API dependency readiness, password plus OTP login, campus visibility and a populated progress dashboard. It saves neither the password nor OTP in the evidence files.

## Operations

Use `pnpm deploy:down` to stop application containers without deleting volumes. Do not add `--volumes` unless permanent data loss is intended. Back up PostgreSQL before upgrades and run the M17 disposable restore verification. For scaling, move PostgreSQL and Redis to managed services, run multiple API replicas behind the gateway and keep a single worker scheduler until job-scheduler ownership is coordinated.

The static M18 configuration is complete locally. The public URL and live evidence require the deployer's server, DNS and SMTP credentials.
