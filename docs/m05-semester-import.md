# M05 · CSV and Excel semester import

M05 turns the academic foundation from M02 and the calendar rules from M04 into a repeatable bulk setup flow. Admin and Program Manager users can download a ready-to-import template, validate it without changing the database, confirm it, inspect import history and download row-level error reports.

## File formats and limits

- `.csv` imports the flat `Semester Setup` dataset.
- `.xlsx` requires a `Semester Setup` sheet and may include a `Calendar` sheet.
- Files are processed in memory and are limited to 5 MB and 5,000 data rows.
- Dates use `YYYY-MM-DD` and codes use uppercase letters, numbers, hyphens or underscores.
- Excel formula cells and formula-like CSV values are rejected. Formula text is never evaluated.

The generated CSV and Excel templates contain fictional, internally consistent demonstration data for four campuses, four semesters, four batches, 25 subjects, 25 offerings and eight calendar overrides. The Excel workbook includes an Instructions sheet and frozen, filterable headings.

## Semester Setup columns

Each row represents one subject offering. Campus, semester, track and batch fields repeat across their offerings and are normalized during import.

| Column                                                      | Meaning                                      |
| ----------------------------------------------------------- | -------------------------------------------- |
| `campus_code`, `campus_name`, `campus_timezone`             | Unique campus identity and local timezone    |
| `semester_name`, `semester_start_date`, `semester_end_date` | Campus semester identity and inclusive range |
| `working_saturday_rule`                                     | `ALL`, `NONE` or `SECOND_AND_FOURTH`         |
| `on_track_threshold`, `tight_threshold`                     | Semester and offering progress thresholds    |
| `track_code`, `track_name`                                  | Programme catalogue entry                    |
| `batch_code`, `batch_name`                                  | Batch within the semester                    |
| `subject_code`, `subject_name`, `subject_description`       | Reusable subject catalogue entry             |
| `target_finish_date`                                        | Planned completion date inside the semester  |

## Calendar columns

The optional Excel `Calendar` sheet accepts campus code, semester name, date, type, title, teaching allowed and notes. Each row must reference a semester present in `Semester Setup`. Dates must fall inside that semester and a semester may have only one override per date.

Holiday and campus-closure rows become non-teaching days. Extra working days become teaching days. Event rows use the supplied teaching flag. This is the same rule normalization used by the M04 calendar engine.

## Workflow

1. `GET /imports/template?format=xlsx|csv` downloads a valid fictional template.
2. `POST /imports/preview` parses and validates the upload without a database write.
3. The UI displays normalized counts and every row, column, submitted value and message that needs correction.
4. `POST /imports` parses the file again and records an `ImportJob`.
5. A valid file upserts the complete campus → semester → batch → offering graph and calendar overrides in one PostgreSQL transaction.
6. Any database failure rolls back all academic writes and marks the job failed.
7. `GET /imports` and `GET /imports/:jobId` expose import history. `GET /imports/:jobId/errors.csv` downloads a spreadsheet-safe report.

The same file can be uploaded again. Natural keys and database upserts update or reuse campuses, semesters, tracks, batches, subjects, offerings and calendar dates rather than creating duplicates.

## Validation

Validation covers required headings and values, date syntax and ranges, threshold ordering, enum values, duplicate offerings, duplicate calendar dates, conflicting repeated campus/semester/track/batch/subject definitions, unresolved calendar references, maximum file size and row count, and formula injection.

All import routes require the global Admin or Program Manager role. A completed import creates an `AuditEvent` containing the actor, file name, import type and normalized record counts.

## Processing decision

The 5 MB and 5,000-row bounds make the college acceptance file small enough to validate and commit synchronously after user confirmation. The worker registry now includes `semester-import` so the same tracked job can move to BullMQ for larger hosted imports without changing the template or database model.

## Verification

Automated coverage includes CSV quoting, CSV and Excel parsing, a valid four-campus/25-subject acceptance file, Calendar-sheet parsing, missing columns, conflicting repeated records, duplicate offerings, out-of-semester overrides, formula rejection, size limits, permission checks, invalid-job recording, one-transaction relationship upserts, the React validate/confirm flow and the import row-count database constraint.

The parser, service and UI tests run without infrastructure. Applying the import to a real PostgreSQL database and running the database integration test remain part of the live Docker verification gate.
