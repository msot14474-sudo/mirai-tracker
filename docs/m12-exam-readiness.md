# M12: Exam readiness

M12 shows faculty and managers whether the syllabus mapped to each upcoming exam is ready. It uses the topic-to-exam mappings created in M07 and the live topic completion recorded through M09. Mid-term and end-term scopes are calculated independently, so a topic contributes only to exams it is explicitly mapped to.

## Required results

For every exam whose start date is on or after the selected as-of date, the view shows:

- exam dates and syllabus deadline;
- days until the exam;
- in-scope topic count and completed-topic count;
- total planned hours in scope;
- covered hours;
- hour-weighted in-scope coverage percentage;
- hours still needed; and
- the same figures and exact topic scope for each accessible subject.

Past exams are excluded. An upcoming exam with no mapped topics remains visible with a clear scope-mapping warning instead of showing a misleading 0% result.

## Calculation

The shared `@mirai/calculations` package receives only topics mapped to one exam. It then applies the official Problem 1 definitions:

```text
planned in-scope minutes = sum of mapped topic minutes, excluding skipped topics
covered minutes = completed topic minutes
                + in-progress topic minutes × completion percentage
coverage % = covered minutes / planned in-scope minutes × 100
hours still needed = (planned in-scope minutes - covered minutes) / 60
```

Calculations use minutes internally and round the displayed hours and percentage to two decimal places. `NOT_STARTED` topics contribute planned time but no covered time. `COMPLETED` topics count fully. `SKIPPED` topics are removed from both numerator and denominator.

## Scope and permissions

The API applies the same offering scope as the M10 and M11 progress views before reading exam mappings:

| Role            | Visible exam readiness                                                   |
| --------------- | ------------------------------------------------------------------------ |
| Admin           | All accessible active and complete offerings                             |
| Program Manager | All accessible active and complete offerings                             |
| Campus Manager  | Offerings in assigned campuses                                           |
| Faculty         | Offerings with an active faculty assignment                              |
| Student         | M12 is hidden; the dedicated read-only student experience belongs to M13 |

Exam totals therefore contain only subjects the current user may view.

## API

`GET /progress/exam-readiness?asOf=YYYY-MM-DD` returns upcoming exam windows in chronological order. Each exam contains its campus and semester, deadline state, aggregated readiness calculation, mapped subjects and their topic-level scope.

The React view makes one request for the selected reporting date. It displays mid-term, end-term, sessional, PUT and other exam types using the same response shape.

## Verification

Automated tests prove that:

- a two-topic mid-term scope calculates 5 planned hours, 3.5 covered hours, 70% coverage and 1.5 hours still needed;
- a wider three-topic end-term scope calculates 6 planned hours, 3.5 covered hours, 58.33% coverage and 2.5 hours still needed;
- skipped topics are excluded;
- invalid minutes and completion percentages are rejected;
- past exams are excluded;
- upcoming exams without mappings remain visible as unmapped;
- the interface shows exam dates, coverage, hours still needed and only each exam's mapped topics; and
- changing the reporting date reloads readiness.

The localhost view is captured in [m12-exam-readiness.png](evidence/m12-exam-readiness.png).

Run the complete verification with:

```bash
pnpm check
```
