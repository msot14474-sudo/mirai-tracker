# M20 - What-if Recovery Planner

## Why this stretch feature

The required product identifies subjects that are ON TRACK, TIGHT or in DANGER. M20 completes the decision loop by answering the next manager question: **how many additional teaching hours would recover this subject?**

The planner appears inside the existing role-scoped progress dashboard for managers and faculty. It uses only subjects already returned by the protected M11 API, so it cannot widen a user's campus or faculty scope.

## User workflow

1. Choose **On track** or **Tight or better** as the intervention target.
2. Review DANGER subjects first, followed by TIGHT subjects when the on-track target is selected.
3. See the minimum extra capacity rounded up to a schedulable half hour.
4. Enter proposed extra hours for one subject or apply every minimum at once.
5. Compare projected buffer and status immediately.
6. Download a spreadsheet-safe CSV or print the plan for an academic review.

The interface states that this is a safe planning scenario. It does not edit timetables, lesson plans, logs, progress snapshots or audit history.

## Calculation

For each subject:

```text
required capacity = remaining hours × selected target ratio
exact extra needed = max(required capacity − available hours, 0)
recommended extra = exact extra needed rounded up to the next 0.5 hour
projected buffer = (available hours + proposed extra hours) ÷ remaining hours
```

The calculation uses the subject's configured thresholds returned by M10. A completed subject needs no intervention. The projected status uses the same ON TRACK, TIGHT and DANGER threshold order as the official calculation engine.

## Marking value

- **Problem fit:** turns early warning into a concrete recovery action.
- **Explainability:** exposes every input, target, shortfall and projected result.
- **Safety:** simulation is read-only and cannot corrupt academic records.
- **Scalability:** calculations run locally over the already-scoped response; no extra API or database load.
- **Accessibility:** labelled controls, live summary, keyboard operation, responsive layout and print styling.
- **Portability:** the CSV neutralises formula-like cells before Excel or Google Sheets opens it.

## Verification

Seven feature-specific tests cover exact capacity, half-hour rounding, target selection, priority ordering, invalid inputs, CSV injection defence and the interactive workflow. Run:

```bash
pnpm --filter @mirai/web test
pnpm verify:m20
pnpm check
```

Machine-readable results are saved in `docs/evidence/m20-stretch-checklist.json` and `.csv`.
The applied two-subject scenario is captured in `docs/evidence/m20-recovery-planner.png`.
