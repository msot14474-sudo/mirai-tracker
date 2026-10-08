# M13: Student read-only view

M13 gives each student one batch-scoped page for following the semester without exposing staff tools. It answers three questions from Problem 1: what has been covered in each subject, what is coming next, and what dates and syllabus scope apply to upcoming exams.

## Batch scope

`GET /student/overview?asOf=YYYY-MM-DD` requires the `STUDENT` role and an active student profile. The service reads the batch ID from the authenticated profile and queries that exact batch. It never accepts a batch, campus or student identifier from the browser.

The response identifies the student's batch, track, semester and campus. Subject offerings are limited to `ACTIVE` and `COMPLETE`, and students receive only the active lesson-plan version.

## Subject progress

Each subject card shows:

- hour-weighted coverage percentage;
- covered hours against planned hours;
- completed topics against total in-scope topics;
- completed and partially completed topics under **What we covered**; and
- the first three unfinished topics under **Coming next**, including the latest planned date where available.

An in-progress topic appears in both lists: it records work already covered and remains the immediate next teaching work. Completed topics leave the coming-next queue, while skipped topics appear in neither calculation nor queue.

Coverage uses the shared minute-based calculation package, so the student percentage matches the faculty and manager progress views.

## Upcoming exams

Exam cards include the exam type, start/end dates, syllabus deadline and days remaining. Scope comes from the exact M07 topic mappings for each exam and subject. Past exams are removed based on the selected as-of date.

## Read-only enforcement

The student experience is read-only at three layers:

1. The controller requires `STUDENT` and exposes one `GET` method.
2. The service takes its batch only from the authenticated student profile.
3. The React view contains no edit forms, mutation buttons or writable fields.

The existing access policy also prevents students from managing subject offerings, lesson plans, timetables, session logs or academic setup.

## Verification

Automated tests verify that:

- only the authenticated student's batch ID is queried;
- completed and in-progress topics appear as covered;
- the next unfinished topics stay in lesson-plan order and include planned dates;
- only upcoming exams appear;
- each exam includes only its mapped topics;
- a non-student or missing profile is rejected before a database query;
- the controller has only the student-protected overview method;
- staff workspaces remain hidden for a student; and
- the rendered student view contains no editing controls.

The localhost student experience is captured in [m13-student-read-only-view.png](evidence/m13-student-read-only-view.png).

Run the complete verification with:

```bash
pnpm check
```
