# Demonstration Script

## Before the presentation

1. Open the M18 HTTPS URL on a laptop and phone-sized browser window.
2. Run API readiness and the demo-data verifier.
3. Confirm the four fictional users can log in with the temporary demonstration password.
4. Keep the M11-M14 screenshots available as a fallback.
5. Never display `.env.production`, SMTP credentials or service secrets.

## 10-minute walkthrough

| Time | Role and screen            | Demonstrate                                                                    | Main point                                        |
| ---: | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| 0:00 | Opening                    | State the spreadsheet problem and desired early warning                        | One calendar-aware source of truth                |
| 0:45 | Program Manager - Semester | Dates, holidays, events, Saturday rule and exams                               | Planning uses real working days                   |
| 1:45 | Program Manager - Import   | Preview the four-campus/25-subject template and row feedback                   | Whole-semester setup is validated before commit   |
| 2:30 | Campus Manager - Timetable | Two recurring slots and generated dated sessions                               | Planned hours come from the timetable             |
| 3:15 | Faculty - Lesson Plan      | Units, ordered topics, planned hours and exam scope                            | Syllabus scope is structured and versioned        |
| 4:15 | Faculty - Planned Dates    | Show topic start/finish dates and capacity                                     | Holidays and cancellations shift later work       |
| 5:00 | Faculty - Daily Log        | Open a pre-filled class, adjust completion and submit                          | Phone-first logging needs minimal entry           |
| 6:00 | Manager - Dashboard        | Show ON TRACK, TIGHT and DANGER, then use M20 to apply a minimum recovery plan | Warning becomes an explainable action             |
| 7:30 | Manager - Exam Readiness   | Compare mid-term and end-term topic scope                                      | Each exam uses its own mapped topics              |
| 8:00 | Student                    | Covered topics, coming next and exam scope; point out no edit controls         | Student access is batch-scoped and read-only      |
| 8:45 | Manager - Alerts/Exports   | Reminder, 48-hour escalation and CSV export history                            | Operational follow-up and reporting are auditable |
| 9:30 | Closing                    | Mention 239 tests, load results, security and deployment                       | Evidence supports the design claims               |

## Suggested narration

“Mirai Tracker does not estimate progress by counting topics. It uses the planned minutes of each topic and the real timetable capacity left before the target date. This is why a long unfinished topic has the correct weight and why adding a holiday immediately changes planned dates and risk.”

For permissions: “The browser never chooses its own campus, faculty assignment or student batch. Those scopes come from the authenticated server-side record.”

For performance: “The local four-campus, 30-subject baseline completed 2,100 requests with no errors at up to 200 concurrent users. We still rerun the same test after deployment because a local harness cannot prove cloud database capacity.”

## Questions to prepare for

- **Why PostgreSQL instead of MongoDB?** The system needs relational integrity, overlap checks and atomic multi-table imports.
- **How is status calculated?** Available teaching hours divided by remaining syllabus hours, with configurable 1.15 and 1.00 thresholds.
- **What happens after a cancellation?** The session is excluded and a new planned-date version shifts affected topics.
- **Can faculty change another subject?** Only active assignees or authorized managers pass the service-level access check.
- **Can a student edit data?** No student mutation route or editing control exists; global guards add another boundary.
- **How do alerts avoid duplicates?** Database uniqueness and delivery keys make each stage idempotent.
- **What is still pending?** The live URL, real volunteer timing study and infrastructure-backed integration/recovery run.

## Failure fallback

If the deployment is unavailable, explain the limitation once, show the saved dashboard, readiness, student and alert screenshots, then run the calculation and test evidence locally. Do not present screenshots as a live deployment.
