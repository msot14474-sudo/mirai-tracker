# Mirai Tracker Future Enhancement Proposals

Prepared: 21 October 2026

This roadmap proposes seven enhancements to connect lecture delivery, student understanding and academic follow-up. Each proposal builds on the existing campus, batch, subject and faculty assignments across HI-Tech, Jaggannath and Rathinam campuses. Mirai and University remain separate tracks within a batch.

These are proposals for future rollout and development, not a list of completed features. Priority and acceptance criteria below are proposed planning targets.

## 1. Faculty lecture logging through WhatsApp

**Purpose:** Let faculty record a lecture from their phone without opening the dashboard.

Extend and roll out the [existing WhatsApp logging integration](whatsapp-logging.md) with a guided confirmation flow and optional voice-note transcription. A faculty member would send the subject, batch, class date, topics covered, completion status and any pending work. AI would match the message to their assigned timetable and lesson plan, then show a concise preview before saving.

For example: “Today's Web Development class for First Year A covered HTML forms. Validation is pending for the next class.” If two classes match, or the amount completed is unclear, the assistant would ask for the missing details rather than inventing them. A confirmed entry would update the same lecture history, coverage and analytics used by the website, and return a receipt with a link to the record.

**Access and controls:** Only a verified, linked faculty number could log its assigned classes. Duplicate message deliveries would not create duplicate records. Corrections would retain an audit trail. A request to move a class would enter the scheduling approval flow rather than silently change the timetable.

**Acceptance:** A confirmed WhatsApp log appears once in the website with matching topics and completion values; ambiguous requests require clarification; revoked assignments cannot submit logs.

## 2. Student lecture reviews and satisfaction follow-up

**Purpose:** Collect feedback after each delivered lecture and turn concerns into an accountable follow-up with the faculty member.

Students would receive a short review for each lecture in their enrolled subjects: a satisfaction rating from 1 to 5, whether the topics were clear, topics needing revision and an optional comment. A student could submit one review per lecture, with edits allowed during a configurable review period. Reviews would be separate from attendance and teaching-completion records.

The assigned faculty member would receive a consolidated lecture summary, including response count, satisfaction distribution and recurring concerns. AI could group similar comments into themes and suggest revision topics, while keeping links to the source feedback. Missing reviews would remain “No response,” not a zero rating.

**Escalation:** All submitted feedback would feed into the faculty's review summary. Concerns meeting configurable rules would create an action item for that faculty member. Unacknowledged or repeatedly unresolved issues would escalate to the campus manager, then to the administrator after the configured period. Each item would show its owner, due date, response and resolution status. Small response samples would be clearly identified and would not alone trigger a negative teaching assessment.

**Access and controls:** Students would see their own submissions; faculty would see feedback for their own lectures; managers would see their campus; administrators would see permitted campuses. Student identities would be hidden in routine faculty summaries, with identity access restricted to authorised case handling. Personal concerns would have a confidential reporting route.

**Acceptance:** Reviews reach the correct teacher, duplicate submissions are prevented, escalation follows the configured hierarchy and timing, and no review changes recorded syllabus coverage.

## 3. Lecture attendance and engagement tracking

**Purpose:** Help faculty identify students who may need support because they repeatedly miss classes.

Offer a short-lived QR code or class code linked to the exact lecture. Faculty would review and confirm attendance, with a manual option when a student has no working device. Students would see their own attendance history; faculty would see assigned classes; managers would see campus-level patterns.

Attendance concerns could produce support reminders using institution-defined thresholds. Student review submission would never count as attendance automatically, and the system would not assume that scanning a code proves participation throughout a class.

**Acceptance:** Only enrolled students can check in to an open lecture, duplicate check-ins are ignored, and corrections show who changed the record and why.

## 4. Topic-linked learning resources

**Purpose:** Keep notes, recordings, practice material and references next to the topics students are studying.

Faculty would attach resources to lesson-plan topics and publish them immediately or after the relevant class. Students would find materials under “Covered topics,” “Next class” and “Exam revision.” AI could suggest tags and produce a short resource summary for faculty review.

Resources would retain their topic links when a class is rescheduled. File versions, publication status and permissions would prevent draft material or restricted resources from appearing in another campus or batch.

**Acceptance:** An enrolled student can access published resources for their subjects; unpublished files remain private; changing a class date preserves its resource links.

## 5. Short formative quizzes and revision recommendations

**Purpose:** Measure understanding of taught topics separately from the number of teaching hours completed.

AI would draft short quizzes from faculty-approved topics and resources. Faculty would review the questions and answers before publishing. Students would receive explanations after submission, while faculty would see topic-level results and suggested revision priorities.

Quiz results could be combined with lecture-review themes to recommend a revision session. They would appear as learning evidence alongside delivery coverage, without rewriting lecture logs or assuming that a low score means the lecture was not taught.

**Acceptance:** Questions remain within the approved topic scope, answers are hidden until the permitted time, and performance recommendations explain which results support them.

## 6. Substitute faculty and visiting faculty handover

**Purpose:** Keep teaching continuity when the assigned teacher is unavailable or a visiting faculty member takes over.

A campus manager would select affected classes and a temporary substitute. The system would check availability and present a handover containing pending topics, recent lecture notes, resources, exam scope and unresolved student concerns suitable for sharing.

After approval, the substitute would receive time-limited access to those classes. Logs would identify the person who actually taught the session. Where visiting faculty payment applies, an approved delivered class would be counted once against the configured per-class rate.

**Acceptance:** Conflicting assignments are flagged, temporary access expires correctly, teaching history preserves the original and substitute assignments, and honorarium calculations do not double-count a class.

## 7. Offline lecture drafts with reliable synchronisation

**Purpose:** Let faculty prepare lecture logs when connectivity is weak and submit them once service returns.

The faculty interface would save a local draft with the class, covered topics, pending work and notes. It would clearly distinguish “Saved on this device” from “Submitted.” On reconnection, the app would recheck the latest assignment and class state before synchronising.

If another device already submitted a record, or the timetable changed, the faculty member would review the conflict instead of overwriting newer data. Locally retained information would be minimised and cleared on sign-out, with a warning before discarding unsent drafts.

**Acceptance:** Connection loss does not erase a draft, repeated synchronisation does not duplicate a log, and offline work cannot bypass revoked access or newer approved records.

## Suggested delivery order

| Phase | Proposals | Intended outcome |
| --- | --- | --- |
| First | WhatsApp rollout; offline lecture drafts | Make accurate faculty logging easier and more reliable |
| Second | Lecture reviews; learning resources | Connect student concerns with teaching follow-up |
| Third | Attendance; formative quizzes; substitute handover | Strengthen student support and teaching continuity |

## Shared implementation requirements

- Enforce campus, batch, track and subject permissions in the API as well as the interface.
- Route notifications to the assigned faculty first, with campus manager and administrator escalation where appropriate; avoid duplicate notifications.
- Use AI for interpretation, summaries and recommendations. Validate all writes and obtain the required human confirmation before changing academic records.
- Preserve the distinction between teaching completed, student understanding, attendance and feedback satisfaction.
- Record who acted, what changed and when. Use configurable deadlines, thresholds and notification preferences.
- Pilot each proposal in one batch, verify permissions and failure recovery, then expand across all three campuses.
- Measure completion time, duplicate/error rate, feedback response rate and resolution time using actual pilot results before setting rollout targets.
