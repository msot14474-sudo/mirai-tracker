# M04 Semester and Academic Calendar

M04 defines the dated teaching calendar that later timetable, topic-planning and progress calculations consume. It uses the `Semester`, `CalendarDayOverride` and `ExamWindow` models created in M02.

## Working-day decision order

The engine evaluates each campus-local date as a date-only value:

1. A dated override wins over the recurring weekday rule.
2. `HOLIDAY` and `CAMPUS_CLOSED` are always non-teaching days.
3. `EXTRA_WORKING_DAY` is always a teaching day, including Sunday.
4. `EVENT` uses its explicit `teachingAllowed` setting.
5. Without an override, Monday through Friday are teaching days and Sunday is closed.
6. Saturday uses the semester rule: all, none, or only the second and fourth Saturday of each month.

The second/fourth calculation uses the Saturday's occurrence within its month, so a fifth Saturday remains closed. Generation is inclusive of the requested boundary dates, must stay inside the semester and is capped at 550 days.

## API

All routes require an authenticated M03 session.

| Method and route                                     | Purpose                                      |
| ---------------------------------------------------- | -------------------------------------------- |
| `GET /academic/campuses`                             | List campuses visible to the current user    |
| `GET /academic/subjects`                             | List the shared active subject catalog       |
| `POST /academic/subjects`                            | Add a subject to the shared catalog          |
| `GET /academic/campuses/:campusId/semesters`         | List campus semesters                        |
| `POST /academic/campuses/:campusId/semesters`        | Create a semester                            |
| `GET /academic/semesters/:semesterId`                | Read setup, overrides and exams              |
| `PATCH /academic/semesters/:semesterId`              | Change semester configuration                |
| `GET /academic/semesters/:semesterId/calendar`       | Generate dated working/non-working results   |
| `POST /academic/semesters/:semesterId/calendar-days` | Add a holiday, event, closure or working day |
| `PATCH/DELETE /academic/calendar-days/:id`           | Correct or remove an override                |
| `POST /academic/semesters/:semesterId/exam-windows`  | Add an exam window                           |
| `PATCH/DELETE /academic/exam-windows/:id`            | Correct or remove an exam window             |

Admin and Program Manager roles may change the calendar. Campus Manager, Faculty and Student roles can only read campuses within their assigned scope. The React management workspace is shown only to Admin and Program Manager users.

## Validation

The API rejects invalid ISO dates, reversed semester or exam ranges, overrides outside the semester, duplicate overrides on one date, exam dates outside the semester, syllabus deadlines after an exam starts, overlapping exam windows, invalid progress-threshold order and attempts to shorten a semester around existing calendar or exam records.

All calendar math uses UTC accessors over date-only values. This prevents an `Asia/Kolkata` calendar date from shifting when it passes through JavaScript or PostgreSQL.

## Interface

Academic setup has separate Semesters and Subjects views and uses the campus already selected in the main dashboard. The Semesters view provides semester creation, Saturday-rule selection, calculated teaching/non-teaching totals, a preview of Saturdays and overrides, holiday/event/extra-day creation, exam-window creation and an exam summary. The Subjects view lets Admin and Program Manager users add a code, name and optional description to the shared catalog and review all active subjects. Both views collapse to a single-column flow on phones.

## Fictional sample

The idempotent seed adds four sample calendar decisions to the HI-Tech semester—two holidays, one academic event and one recovery Sunday—plus non-overlapping mid-term and end-term windows. These records are local demonstration data.

## Verification

Unit tests cover all/none/second-and-fourth Saturdays across January through March 2026, the fifth-Saturday edge case, holiday precedence, a working Sunday, events with and without teaching, range enforcement, semester validation, override boundaries, exam deadlines, exam overlap, subject listing and creation, and permission enforcement. A frontend test verifies the complete add-subject flow. A separate PostgreSQL integration test proves the database's one-override-per-date constraint when infrastructure is available.
