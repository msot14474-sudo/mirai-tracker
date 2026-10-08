# M10 — Progress calculation engine

M10 implements the formulas mandated by Problem 1. All calculations use minutes internally and convert to hours only at the API boundary. Display values are rounded to two decimal places after the full calculation.

## Required formulas

| Metric          | Implementation                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Hours in scope  | Sum of planned topic minutes, excluding `SKIPPED`, divided by 60                                   |
| Covered hours   | `COMPLETED` topics count fully; `IN_PROGRESS` topics count planned minutes × completion percentage |
| Coverage %      | Covered minutes ÷ in-scope minutes × 100                                                           |
| Remaining hours | In-scope minutes − covered minutes                                                                 |
| Available hours | Usable scheduled-session minutes after the as-of date and through the target finish date           |
| Buffer ratio    | Available minutes ÷ remaining minutes                                                              |
| Pace vs plan    | Covered minutes − usable timetable minutes that should have been delivered by the as-of date       |
| Overdue         | A non-skipped, incomplete topic whose latest M08 planned finish date is before the as-of date      |

Usable sessions have status `SCHEDULED`, `IN_PROGRESS`, or `COMPLETED`. Cancelled, skipped, and merged sessions provide no capacity. The reporting date is treated as end-of-day: its teaching capacity is included in plan-to-date, while available capacity begins on the next teaching date. The target finish date is included.

## Status rules

`COMPLETE` applies when remaining hours are zero. Otherwise:

- `ON_TRACK`: buffer ratio is at or above the on-track threshold, default `1.15`.
- `TIGHT`: buffer ratio is at or above the tight threshold, default `1.00`, but below on-track.
- `DANGER`: buffer ratio is below the tight threshold.

An offering-level threshold overrides the semester default. Comparisons use unrounded ratios; rounding is only for output.

## Traceability and access

`GET /progress/subjects?asOf=YYYY-MM-DD` calculates all accessible subjects. Global managers see all subjects, Campus Managers see their campuses, faculty see active assignments, and students see their batch. `GET /progress/subjects/:offeringId` provides one calculation. Authorized staff can persist an immutable, versioned result with `POST /progress/subjects/:offeringId/snapshots?asOf=YYYY-MM-DD`; the same transaction writes an audit event.

The calculation response identifies the lesson-plan version and M08 schedule version used. Snapshots retain source minutes, coverage, ratio, signed pace, and status. Negative pace is deliberately allowed because Problem 1 defines it as behind plan.

## Hand-calculation evidence

[`evidence/m10-hand-calculations.csv`](evidence/m10-hand-calculations.csv) contains three fictional subjects with different topic and class durations. They independently produce `ON_TRACK`, `TIGHT`, and `DANGER`. Run:

```bash
pnpm verify:m10
```

The command fails if any hours, percentage, pace, ratio, or status differs from the hand-entered expected value. Unit tests cover the same three cases, completion, cancelled capacity, configurable thresholds, validation, API scoping, snapshots, and audit records.
