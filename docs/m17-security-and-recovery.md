# M17 — Security and recovery checks

M17 turns the existing permission rules into a reviewable security boundary and adds a repeatable PostgreSQL recovery procedure. It does not add real credentials or external accounts.

## Security controls

| Area                         | Implemented control                                                                                                                                                     | Verification                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Authentication               | scrypt password hashes, opaque random Redis sessions, HTTP-only SameSite cookies and production-only Secure cookies                                                     | Password, auth service and controller tests |
| Brute-force resistance       | An email-derived HMAC key counts failed logins in Redis for 15 minutes; the fifth failure and later attempts receive HTTP 429                                           | Auth service tests                          |
| Authorization                | Authentication and role checks are global. Resource services still enforce campus, faculty assignment and student-batch scope                                           | Access-policy and feature tests             |
| Browser request origin       | State-changing browser requests with an `Origin` header must exactly match `WEB_ORIGIN`; service calls without a browser origin remain supported                        | Origin guard tests                          |
| Input and database integrity | Zod validates request data and Prisma/PostgreSQL constraints protect relationships, uniqueness and states                                                               | Existing schema, service and database tests |
| Audit history                | Successful logins and existing domain mutations create `AuditEvent` records. `GET /audit-events` is limited to Admin and Program Manager and accepts bounded filters    | Auth and audit tests                        |
| Error responses              | Expected HTTP errors remain actionable; unexpected exceptions are logged server-side and return only `Internal server error.`                                           | Exception-filter tests                      |
| Deployment configuration     | Startup validates PostgreSQL/Redis URLs, paired SMTP credentials and required secrets. Production rejects weak placeholders, HTTP browser origins and the demo password | Environment tests                           |
| Network exposure             | Local Compose ports bind to `127.0.0.1`                                                                                                                                 | M17 static verifier                         |
| Secret hygiene               | `.env`, backups and known credential forms are excluded or scanned                                                                                                      | M17 static verifier                         |

The login limiter is intentionally keyed by a server-secret HMAC of the normalized email. Redis never stores a readable address in the limiter key, and every invalid login receives the same message. A reverse proxy should also impose an IP-level limit in production.

## Audit-history API

`GET /audit-events` supports `action`, `entityType`, `actorId`, `campusId`, `before` and `limit` (maximum 100). Results are newest first and include limited actor and campus identity data. The `before` timestamp is returned as `nextBefore` when a page is full.

This endpoint contains operational history and is therefore unavailable to Campus Manager, Faculty and Student roles. Audit data is append-only through the application; the API exposes no update or delete route.

## Backup procedure

With the Docker Compose PostgreSQL service running:

```bash
pnpm backup:database
```

The script creates a timestamped custom-format dump in `backups/`, applies owner-only process permissions with `umask 077`, and writes a SHA-256 checksum beside it. Copy the dump and checksum to encrypted off-host storage for a real deployment.

Verify both integrity and restorability after every backup policy change:

```bash
pnpm verify:backup backups/mirai-tracker-YYYYMMDDTHHMMSSZ.dump
```

Verification checks the checksum and archive catalog, creates a disposable PostgreSQL database, restores the archive, runs a query and drops that database. It does not alter the working Mirai database.

## Restore procedure

1. Stop the API and worker so no writes occur during recovery.
2. Preserve a backup of the current database when possible.
3. Verify the selected backup with `pnpm verify:backup BACKUP_FILE`.
4. Review the timestamp and checksum.
5. Run the destructive restore deliberately:

```bash
MIRAI_RESTORE_CONFIRM=RESTORE_MIRAI_TRACKER pnpm restore:database BACKUP_FILE
```

6. Apply committed migrations with `pnpm db:migrate:deploy`.
7. Start the API, check `/health/ready`, sample the audit history and verify a manager dashboard.
8. Start the worker. Redis sessions and jobs are operational data rather than the academic source of truth, so users may need to log in again and scheduled alert scans can repopulate work.

For a production service, use managed PostgreSQL encryption, automated daily snapshots and point-in-time recovery. With daily snapshots, the stated baseline recovery-point objective is 24 hours and the recovery-time target is two hours. These are initial operating targets, not demonstrated guarantees; production restore drills must measure them with the deployed database volume and provider.

## Incident and secret rotation

If a credential may be exposed, disable the affected ingress, rotate `SESSION_SECRET`, `INTERNAL_JOB_SECRET`, database, Redis and SMTP credentials as applicable, then restart the services. Rotating `SESSION_SECRET` invalidates all active sessions. Review audit events for the affected period, preserve logs and document the scope before returning the system to service.

## Evidence

Run `pnpm verify:m17` to regenerate:

- `docs/evidence/m17-security-checklist.json`
- `docs/evidence/m17-security-checklist.csv`

The automated project check covers types, tests and builds. Shell syntax is checked separately. The disposable database restore requires a running Docker/PostgreSQL environment and remains an environment-level drill for M18 deployment validation.
