# M11: Subject, track and campus dashboards

M11 turns the M10 calculation into the main early-warning workspace for faculty and managers. Every figure is calculated for a selected **as-of date** and uses only subject offerings permitted by the signed-in user's role and scope.

## Views and permissions

| Role            | Dashboard scope                                                      |
| --------------- | -------------------------------------------------------------------- |
| Admin           | All active and complete offerings                                    |
| Program Manager | All active and complete offerings                                    |
| Campus Manager  | Offerings in assigned campuses                                       |
| Faculty         | Offerings with an active faculty assignment                          |
| Student         | No M11 dashboard; the separate read-only student view belongs to M13 |

The API applies this scope before calculating any roll-up. A campus manager therefore cannot infer another campus's totals from a summary.

## Required metrics

The overall view, every campus, every track and every subject display:

- planned hours in scope;
- covered hours and weighted coverage percentage;
- remaining hours;
- available teaching hours through the target finish date;
- planned hours by the selected date;
- signed pace against plan;
- buffer ratio; and
- `ON TRACK`, `TIGHT`, `DANGER` or `COMPLETE` status.

Subjects also identify overdue topics. The interface includes an as-of date selector and subject search, and it adapts to phone-sized screens.

## Roll-up rules

Hours are added before rounding. Coverage is therefore hour-weighted:

```text
roll-up coverage % = total covered hours / total hours in scope × 100
roll-up buffer ratio = total available hours / total remaining hours
roll-up pace = total covered hours - total planned hours by today
```

The roll-up status is deliberately **the worst subject status**, using this attention order:

```text
DANGER → TIGHT → ON TRACK → COMPLETE
```

This status is not derived from the aggregate buffer ratio. For example, a large healthy subject can make a track's total buffer look healthy while one smaller subject has no capacity left. The track remains `DANGER` until that subject improves. This prevents an average from hiding a syllabus risk.

## API

`GET /progress/dashboard?asOf=YYYY-MM-DD` returns one scoped payload:

- `summary`: roll-up of every visible subject, or `null` for an empty scope;
- `campuses`: alphabetical campus roll-ups;
- `tracks`: alphabetical track roll-ups; and
- `subjects`: subject-level M10 calculations and overdue topics.

The frontend makes one request for a reporting date. Campus and track values come from the shared `@mirai/calculations` roll-up function used by the API; the browser does not reimplement the formula.

## Verification

Automated coverage proves that:

- a `DANGER` subject keeps its track and campus in `DANGER` even when the combined buffer ratio is above the `ON TRACK` threshold;
- coverage uses total hours rather than an average of subject percentages;
- all-complete groups have 100% coverage and no buffer ratio;
- empty or invalid calculation inputs are rejected safely;
- the API returns scoped campus and track groups and handles an empty scope;
- every required metric appears in the campus, track and subject interface;
- changing the reporting date reloads the endpoint; and
- filtering subject cards leaves authoritative server roll-ups unchanged.

The localhost manager view is captured in [m11-progress-dashboard.png](evidence/m11-progress-dashboard.png).

Run the milestone checks with:

```bash
pnpm --filter @mirai/calculations test
pnpm --filter @mirai/api test
pnpm --filter @mirai/web test
pnpm check
```
