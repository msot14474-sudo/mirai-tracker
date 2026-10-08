# M15 — Reports and CSV exports

M15 gives Admin and Program Manager users a dedicated export centre. It implements the problem statement's manager export permission, all-data CSV option and visiting-faculty planned-versus-taken lecture and honorarium report. Campus Manager, Faculty and Student roles cannot call these routes or see the workspace.

## Export catalogue

| Export | Parameters | One row represents | Main fields |
| --- | --- | --- | --- |
| Campus progress | Position date | One campus | Subject count, hour-weighted coverage, remaining/available hours, pace, buffer, overdue topics, status counts and worst status |
| Subject progress | Position date | One subject offering | Campus, track, batch, subject, target date, planned/covered/remaining/available hours, pace, buffer, overdue topics and status |
| Visiting faculty honorarium | Month, rate per taken lecture | One visiting faculty/subject pairing | Planned lectures, taken lectures, taken minutes, rate and computed payable amount |
| Full data archive | None | One database record | Dataset name, record id and a JSON representation of every scalar field |

The full archive contains academic setup, people and role assignments, timetable and generated sessions, lesson plans and topic schedules, session logs, progress snapshots, alerts, notification deliveries, import history and audit events. It deliberately excludes password credentials and web-session secrets.

## Honorarium rules

- A session belongs to the report when its faculty assignment is marked `VISITING` or the linked staff profile is a visiting profile.
- `planned_lectures` counts generated sessions in the selected calendar month.
- `taken_lectures` counts sessions whose latest immutable log is `COMPLETED` or `IN_PROGRESS`.
- `taken_minutes` uses the actual scheduled start/end duration for those taken lectures.
- `honorarium_amount = taken_lectures × rate_per_lecture`.

The rate is entered when the manager runs the export because the challenge data model does not prescribe a permanent faculty rate. This makes the assumption visible in every row instead of hiding it in application configuration.

## API

All routes require an authenticated `ADMIN` or `PROGRAM_MANAGER` role.

```text
GET  /exports    List the 20 most recent export jobs
POST /exports    Validate a typed request, create the CSV and return a download
```

Request examples:

```json
{ "type": "CAMPUS_PROGRESS", "asOf": "2026-10-08" }
```

```json
{
  "type": "VISITING_FACULTY_HONORARIUM",
  "month": "2026-09",
  "ratePerLecture": 1800
}
```

The response uses `text/csv; charset=utf-8`, a UTF-8 byte-order mark and a `Content-Disposition` download filename. CORS exposes that filename to the React client.

## Audit and failure behaviour

Every request creates an `ExportJob` in `PROCESSING`. Success changes it to `COMPLETED`, stores the generated filename and writes an `AuditEvent` with action `EXPORT`. A generation error changes the job to `FAILED` and stores a bounded error message. The recent-jobs panel surfaces the same records to managers.

No generated file is kept on the API filesystem. The CSV is streamed back immediately; `storageKey` records its download filename for the audit trail.

## Spreadsheet safety

CSV output follows RFC 4180 quoting and CRLF line endings. Values beginning with `=`, `+`, `-` or `@` receive a leading apostrophe before export, preventing user-entered subject names, notes or summaries from becoming spreadsheet formulas when opened in Excel or Google Sheets. Quotes, commas and multiline text are preserved.

## Verification

Automated tests cover RFC 4180 escaping, Unicode/BOM output, formula neutralisation, permission checks, campus progress content, export job/audit completion, visiting-faculty planned-versus-taken counts, honorarium calculation, request payloads and browser downloads.

Run the complete workspace gate with:

```bash
pnpm check
```
