# M09 — Mobile daily session logging

M09 gives faculty a phone-first record for every scheduled class. It implements the Problem 1 fields exactly: session status, percentage complete, covered work, leftover work, carry-forward topic, classwork, homework and notes. The timetable, subject, batch, class time and current lesson-plan topic are filled in before the faculty member acts.

## Fast confirmation flow

The workspace opens on the current teaching date and lists only classes for subjects actively assigned to the signed-in faculty profile. For a new class it suggests:

- `COMPLETED` as the class status and 100% as the session completion;
- the first lesson-plan topic that is neither completed nor skipped;
- the topic completion increase represented by the scheduled class minutes;
- the topic title as the covered summary;
- the same topic as carry-forward, with `Continue <topic>`, when the class cannot finish it;
- classwork and homework as `NOT_ASSIGNED`.

The suggested topic percentage is:

```text
current percentage + min(class minutes, remaining topic minutes) / planned topic minutes × 100
```

It is capped at 100 and rounded to two decimal places. Faculty see the suggestion before saving. They can change every value, add more covered topics or remove topic updates. The standard accurate case takes one confirmation tap.

## Required statuses and fields

The form supports `COMPLETED`, `IN_PROGRESS`, `SKIPPED`, `MERGED` and `CANCELLED`.

- Skipped, merged and cancelled classes cannot advance topic progress.
- A merged class requires the other assigned scheduled class.
- A cancelled class requires a reason.
- Topic progress cannot move backwards or refer to another lesson plan.
- The sum of per-topic minutes cannot exceed the class duration.
- Carry-forward topics must belong to the selected plan.
- Classwork and homework use `NOT_APPLICABLE`, `NOT_ASSIGNED`, `ASSIGNED`, `PARTIAL` or `COMPLETED` independently.

Submitting updates the scheduled-session status and topic progress in the same database transaction. Each save creates the next immutable `SessionLog` revision with per-topic before/after percentages. Corrections therefore preserve earlier evidence. Every revision creates an audit event containing the offering, scheduled class and browser-measured completion time.

## Permissions

Only a user with the Faculty role and a staff profile can use these routes. The service checks that the faculty member has an active assignment covering the session date. A manager who also has broad campus access cannot use that access to log another faculty member's subject. Students cannot see or submit the workspace.

## API

| Method | Route                                    | Purpose                                                                                       |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET`  | `/session-logs/sessions?date=YYYY-MM-DD` | Return assigned classes, current topics, latest revisions, merge targets and prefilled values |
| `POST` | `/session-logs/sessions/:sessionId/logs` | Save the next revision and atomically update the session and topics                           |

## Five-faculty timing study

The college requires five faculty volunteers to log a session on a phone with a median time under 60 seconds. Automated UI speed is not a substitute for this usability study, so no volunteer results are fabricated.

Use this protocol:

1. Seed or prepare five unlogged fictional sessions with the same normal completed-class scenario.
2. Give each volunteer the same phone or record the device in the evidence sheet.
3. Start timing when the prefilled class card is visible.
4. Ask the volunteer to check the suggestion and submit an accurate log without coaching.
5. Stop when the saved-revision confirmation appears. Copy the displayed time into `docs/evidence/m09-logging-speed-study.csv`.
6. Run `pnpm study:m09`. The command sorts the five or more times, calculates the statistical median and exits unsuccessfully unless the median is below 60 seconds.

The empty evidence sheet is intentional until human volunteers complete the study. Client timing is also stored in the session-log audit metadata for later cross-checking.

## Verification

API tests cover faculty/date scoping, plan selection, minute-derived prefills, atomic revisions, audit timing, correction revisions, foreign topics, backward progress, excessive topic minutes and unassigned faculty. Schema tests cover all non-teaching rules, merge targets, cancellation reasons and duplicate topics. React tests cover the prefilled mobile form, one-tap payload, cancellation path and correction state.

The PostgreSQL suite adds checks for percentage bounds, unique session revisions and forward-only topic progress. Run it with `pnpm db:test` after PostgreSQL is available.
