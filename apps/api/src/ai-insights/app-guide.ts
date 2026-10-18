import { appScreens } from './app-screens.generated';

export const applicationGuide = {
  product: 'Mirai Tracker',
  version: appScreens.version,
  purpose:
    'Campus course progression, semester planning, teaching records, student feedback and exam readiness.',
  workflows: [
    'Semester setup: select the campus; create a semester with its ORIGINAL start/end dates and working Saturdays (all, none, second and fourth). Select it to view every date. Update calendar date marks a holiday, event, extra working day or campus closure; changes recalculate future teaching dates. Add exam windows and syllabus deadlines.',
    'Subjects: Semester setup → Subjects lists the campus catalog. Add subject creates a catalog entry; it still needs a batch/semester offering to have a timetable or lesson plan. Delete is available to administrators, but linked teaching records prevent deletion.',
    'Semester import: select/create the semester, then upload Excel/CSV teaching records. Read file, select the sheet/header and match columns (optionally with AI), deselect optional fields, review validation, confirm. Original file dates are preserved, not shifted to today. Correct dates outside the semester. Existing progress creates lesson topics and recorded completion, not invented attendance or historical session logs.',
    'Update calendar from file (Semester import): choose an existing semester, upload a text PDF, XLSX or CSV academic calendar, then read and verify. Two AI passes suggest explicit holidays, events and exams. Review and edit dates, remove unwanted entries, add missing dates, choose exam syllabus deadlines and approve before saving. Only listed dates change; unlisted months and the Saturday rule remain intact. Explicit dates override weekly defaults. Scans and colour-only markings need manual review; ambiguous dates are not guessed.',
    'Subjects show their default teacher and batch-specific teachers. Assign teacher is available after creating a subject. Only active faculty in the selected campus can be chosen. The subject default is inherited by new and unassigned batches; assigning to a particular batch adds teaching access without replacing co-teachers or historical lecture ownership.',
    'Timetable: choose semester and subject/batch, set weekday, start/end time, effective dates and faculty. Weekly slots generate dated sessions using the semester calendar. Set recurring class times separately after importing course progress.',
    'Lesson plans: assigned faculty and managers upload units/topics with planned teaching hours, review the plan and define exam scope. Draft plans need review/activation. Planned dates allocate topic minutes against usable timetable hours; holidays and cancellations affect later dates.',
    'Daily logging: faculty choose a scheduled session and record Completed, In Progress, Skipped, Merged or Cancelled; completion, covered content, leftovers, carry-forward topic, classwork, homework and notes. Missing logs mean undocumented teaching, not necessarily missed lectures.',
    'Progress and exam readiness: planned/covered/remaining hours, coverage, available teaching time, buffer and pace. Track status uses the worst subject. Exam readiness uses the selected exam scope and deadline; topic completion and hours coverage are separate metrics.',
    'Student view: students see only their batch subjects, covered/next topics, exams and scope, and can submit lecture understanding feedback and explain unclear topics.',
    'User access: administrators manage campus managers, faculty and administrators; campus managers manage permitted faculty and students. New accounts have no demo records. Account/Help are in the sidebar profile menu. Role and campus permissions always apply.',
    'Alerts: scheduled lectures without logs trigger end-of-day faculty reminders and campus-manager escalation after 48 hours. Delivery depends on configured notification services.',
    'AI insights: a continuing personal conversation with fresh authorized records on each message. It can explain app workflows, analyse available records and propose next steps, but cannot edit records, send messages or claim an action was completed. Download report exports an answer. Secrets, passwords and other campuses outside the user scope are never available.',
  ],
  screens: appScreens.screens,
};
