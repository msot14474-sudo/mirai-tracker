# M14 — Missed-log reminders and escalation

## Requirement

For every scheduled class that still has no session log:

1. Send the assigned faculty member one reminder at the end of the campus's local calendar day.
2. If the log is still missing exactly 48 hours after the scheduled class ends, notify every active Campus Manager assigned to that campus.

The two deadlines are independent. For a class ending at 15:30 in `Asia/Kolkata`, the faculty reminder becomes due at `23:59:59.999` that day and the manager escalation becomes due 48 hours after 15:30.

## Processing flow

BullMQ registers two recurring scans on the `mirai-jobs` queue:

| Job                         | Frequency          | Stage                              |
| --------------------------- | ------------------ | ---------------------------------- |
| `missed-session-reminder`   | Every five minutes | Faculty end-of-day reminders       |
| `campus-manager-escalation` | Every five minutes | Campus Manager 48-hour escalations |

The worker calls `POST /missed-log-alerts/process-due` with `INTERNAL_JOB_SECRET`. The route is outside user-cookie authentication but rejects missing or incorrect worker credentials with a constant-time comparison. The API selects only `SCHEDULED` sessions whose `endsAt` has passed and whose `logs` relation is empty, then applies the precise timezone-aware threshold.

`GET /missed-log-alerts/me` returns only alerts addressed to the authenticated Faculty or Campus Manager. The React alert center refreshes that history every minute and shows timing rules, class context, status and channel delivery evidence.

## Duplicate and late-log safeguards

Each alert uses this unique key:

```text
<alert type>:<scheduled session id>:<recipient user id>
```

The database already enforces uniqueness on `MissedLogAlert.deduplicationKey`. Email and in-app delivery rows also have a unique alert/recipient/channel/attempt key. Repeated scans therefore reuse the original records and do not send a second successful notification.

When faculty submit a log, the same database transaction cancels queued deliveries and pending or failed alerts for that scheduled session. A recorded log also excludes the session from every later scan, which prevents the 48-hour escalation.

## Delivery and audit evidence

M14 sends email through the existing SMTP configuration and records an in-app delivery. Local Docker Compose points SMTP at Mailpit:

- SMTP server: `mailpit:1025`
- Mailpit inbox: `http://localhost:8025`
- Default sender: `notifications@mirai.local`

Successful email delivery stores the provider message ID, sent time and alert status. A system `AuditEvent` records the campus, session, recipient, alert type and due time. SMTP failures remain visible as failed delivery and alert records instead of being silently discarded.

## Environment variables

| Variable                         | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `INTERNAL_API_URL`               | API address used by the worker                   |
| `INTERNAL_JOB_SECRET`            | Shared private credential for worker-only routes |
| `SMTP_HOST`, `SMTP_PORT`         | SMTP connection                                  |
| `SMTP_FROM`                      | Sender address                                   |
| `SMTP_SECURE`                    | Enable TLS for a hosted SMTP account             |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | Optional hosted SMTP credentials                 |

The local Mailpit setup needs no external account. Replace `INTERNAL_JOB_SECRET` and add hosted SMTP credentials only when deploying the real product.

## Automated evidence

Tests cover:

- the exact end of day in `Asia/Kolkata`;
- independent timezone conversion;
- the millisecond immediately before and exactly at each deadline;
- the exact 48-hour manager threshold;
- assigned-faculty and campus-manager recipient selection;
- database queries that exclude logged and non-scheduled sessions;
- successful SMTP and in-app delivery recording;
- duplicate suppression;
- failure recording;
- worker schedule and protected API request;
- cancellation when a late log arrives;
- recipient-scoped alert history and role-aware React rendering.

Local visual evidence is stored at `docs/evidence/m14-missed-log-alerts.png`.
