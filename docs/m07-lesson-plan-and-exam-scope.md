# M07 — Lesson plan and exam scope

M07 gives managers and assigned faculty a structured, versioned syllabus for each subject offering. A plan contains ordered units and topics, planned teaching minutes and topic-level exam scope. The planned time becomes the input for M08 planned-date calculation and later hour-weighted progress.

## Access

- Admin and Program Manager users can manage every offering.
- Campus Manager users can manage offerings in their assigned campuses.
- Faculty users can manage only offerings with an active assignment for their staff profile.
- Student editing remains unavailable. The read-only student experience belongs to M13.

Every offering detail and mutation checks the offering scope in the API. The React workspace follows the same role rules but is not treated as the security boundary.

## Upload format

The workspace supplies ready-to-use CSV and Excel templates. Excel files must contain a `Lesson Plan` sheet. Both formats use these columns:

| Column              | Rule                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `unit_sequence`     | Positive whole number; units start at 1 with no gaps               |
| `unit_title`        | Required, maximum 200 characters                                   |
| `unit_description`  | Optional                                                           |
| `topic_sequence`    | Positive whole number; restarts at 1 inside each unit with no gaps |
| `topic_title`       | Required, maximum 240 characters                                   |
| `topic_description` | Optional                                                           |
| `planned_minutes`   | Positive whole number; source of planned teaching hours            |
| `exam_names`        | Optional exact exam-window names separated with `                  | `   |

Validation happens before a database write. It checks file type and size, required columns, formulas, duplicate/gapped sequences, consistent unit details, positive durations and exam names against the offering's semester. The preview reports units, topics and total planned teaching time.

## Version lifecycle

Each valid import creates a new `DRAFT` version. Earlier versions are retained. Units, topics, descriptions, planned minutes and exam scopes can be edited only while the version is a draft.

Activating a draft:

1. marks the previous active version `SUPERSEDED`;
2. marks the selected version `ACTIVE` with approver and timestamp;
3. marks the subject offering active;
4. preserves every earlier version for reproducibility.

To change an active plan, upload a new version and edit that draft. This prevents historical session calculations from silently changing.

## Exam scope

An exam scope is a many-to-many mapping between a semester exam window and topics in one lesson-plan version. Scope replacement is atomic. The API rejects exam windows from another semester and topics from another plan. The interface shows each exam's dates and syllabus deadline with topic checkboxes and scoped-topic totals.

## API

| Method  | Route                                                   | Purpose                                                    |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `GET`   | `/lesson-plans/template?format=xlsx                     | csv`                                                       | Download the fictional sample template |
| `GET`   | `/lesson-plans/offerings`                               | List offerings accessible to the current editor            |
| `GET`   | `/lesson-plans/offerings/:offeringId`                   | Read versions, latest plan, units, topics and exam windows |
| `POST`  | `/lesson-plans/offerings/:offeringId/preview`           | Validate an uploaded file without writing data             |
| `POST`  | `/lesson-plans/offerings/:offeringId/import`            | Create a new draft version atomically                      |
| `PATCH` | `/lesson-plans/units/:unitId`                           | Edit a draft unit                                          |
| `PATCH` | `/lesson-plans/topics/:topicId`                         | Edit a draft topic and planned minutes                     |
| `PUT`   | `/lesson-plans/plans/:planId/exam-scopes/:examWindowId` | Replace one exam's topic scope                             |
| `POST`  | `/lesson-plans/plans/:planId/activate`                  | Activate a draft and supersede the earlier active plan     |

Imports create a completed `LESSON_PLANS` import record. Imports, edits, scope changes and activation also create audit events.

## Fictional sample

The supplied DSA sample contains three units, eight topics and 1,380 planned minutes (23 hours). Mid-term and end-term scope names match the fictional M04 exam windows. The seed stores the same complete sample and is idempotent.

## Verification

Automated tests cover CSV/Excel parsing, formula protection, required columns, duplicate and gapped sequences, role-scoped offering lists, unknown exam names, version creation, scope creation and replacement, draft-only editing, activation, audit records, React summaries, upload preview/import and form payloads.

Run local source verification with:

```bash
pnpm check
```

The PostgreSQL suite adds checks for positive topic minutes and unique unit sequences. Run it with `pnpm db:test` after a migrated PostgreSQL instance is available.
