# M06 — Timetable setup and planned teaching hours

M06 turns a recurring weekly timetable into dated teaching sessions. Admin, Program Manager and Campus Manager users can manage timetable entries for campuses inside their scope. Faculty and students do not receive setup access.

## Weekly entry

Each active entry belongs to one subject offering and contains:

- an ISO weekday (`1` Monday through `7` Sunday);
- local start and end times in 24-hour `HH:mm` format;
- effective start and end dates inside the semester;
- an optional active faculty assignment whose dates cover the entry.

Planned teaching time is always calculated as `end time - start time`. It is not accepted as a separate editable value. A slot must end after it starts and may be at most eight hours.

## Session generation

Every timetable change regenerates the offering's dated sessions. The generator:

1. reads the M04 semester calendar and its working-Saturday rule;
2. applies holidays, campus closures, events and extra working days;
3. keeps only working dates matching the entry weekday and effective range;
4. interprets the slot in the campus IANA timezone and stores UTC timestamps;
5. creates a stable source key in the form `timetable:<entry-id>:<date>`.

For example, a Monday 09:00–10:30 entry contributes 90 planned minutes for every eligible Monday. A holiday Monday contributes no session. An extra working Sunday can contribute a Sunday session.

Regeneration is safe to repeat. Future `SCHEDULED` sessions without logs are updated or removed as the timetable changes. Completed, in-progress or logged sessions are preserved as academic history. Archiving an entry marks it inactive and reconciles its removable future sessions.

## Conflict and boundary rules

- Entries must stay inside their semester.
- Overlapping effective ranges and clock times are rejected for the same batch.
- The same faculty assignment cannot overlap across batches.
- A faculty assignment must belong to the offering, be active and cover the full timetable range.
- PostgreSQL also enforces weekday, time-range and effective-date constraints.

## API

All routes require an authenticated Admin, Program Manager or Campus Manager and then enforce campus scope.

| Method   | Route                                        | Purpose                                                                 |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `GET`    | `/timetable/semesters/:semesterId/offerings` | List offerings with weekly planned minutes and generated-session counts |
| `GET`    | `/timetable/offerings/:offeringId`           | Read entries, assignments, sessions and hour summaries                  |
| `POST`   | `/timetable/offerings/:offeringId/entries`   | Add a weekly entry and regenerate sessions                              |
| `PATCH`  | `/timetable/entries/:entryId`                | Edit an entry and regenerate sessions                                   |
| `DELETE` | `/timetable/entries/:entryId`                | Archive an entry and reconcile sessions                                 |
| `POST`   | `/timetable/offerings/:offeringId/generate`  | Explicitly regenerate an offering                                       |

## Manager interface and sample data

The React manager workspace selects a campus, semester and subject offering, then shows weekly hours, dated-session count and total semester hours. Managers can add faculty-linked slots, archive them and regenerate dates. Session previews use the campus timezone.

The seed creates two weekly patterns for the fictional DSA offering and derives its scheduled sessions from the sample calendar. The worker job catalogue includes `generate-scheduled-sessions` for later queued execution; the M06 API currently performs reconciliation synchronously so users immediately see the result.

## Verification

Automated coverage includes time parsing and duration, working-day generation, holidays and extra days, second/fourth Saturdays, effective ranges, timezone conversion, invalid daylight-saving times, permissions, faculty coverage, overlap detection, historical preservation, React rendering and form payloads, and worker registration.

Run all local checks with:

```bash
pnpm check
```

The PostgreSQL constraint suite is available with `pnpm db:test`. It requires the Docker database or another migrated PostgreSQL instance through `DATABASE_URL`.
