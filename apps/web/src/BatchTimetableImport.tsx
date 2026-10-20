import { useState } from 'react';
import {
  BatchTimetablePreview,
  OfferingListItem,
  timetableApi,
} from './timetable';
const weekdays = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function BatchTimetableImport({
  offerings,
  onChanged,
  selectedBatchId,
  open,
  onToggle,
}: {
  offerings: OfferingListItem[];
  selectedBatchId?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const batches = [
    ...new Map(offerings.map((o) => [o.batch.id, o.batch])).values(),
  ];
  const [localBatchId, setBatchId] = useState(
    batches.length === 1 ? batches[0]!.id : '',
  );
  const batchId = selectedBatchId ?? localBatchId;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BatchTimetablePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function reset() {
    setPreview(null);
    setError('');
    setSaved(false);
  }
  async function run(commit = false) {
    if (!file || !batchId) return;
    setBusy(true);
    setError('');
    try {
      const result = await timetableApi.importBatch(batchId, file, commit);
      setPreview(result);
      setSaved(commit);
      if (commit) await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      hidden={selectedBatchId !== undefined && !open}
      id="batch-timetable-upload"
      className="batch-import"
      open={open}
      onToggle={(e) => onToggle?.(e.currentTarget.open)}
    >
      <summary>
        Upload batch timetable
        <small>
          Add all subjects for one batch from Excel or CSV. You can edit
          individual classes below afterwards.
        </small>
      </summary>
      <p>
        Use one row per weekly class with{' '}
        <strong>Subject, Teacher, Day, Start time and End time</strong>. Match
        subjects by code and teachers by email. Repeat dates are optional and
        default to the semester dates. A weekly grid also works: use Day with time-range columns, or Time with weekday columns. Each cell contains a subject code, optionally followed by | teacher email.
      </p>
      <div className="form-grid">
        <label>
          Batch for timetable
          <select
            value={batchId}
            disabled={busy || selectedBatchId !== undefined}
            onChange={(e) => {
              setBatchId(e.target.value);
              reset();
            }}
          >
            <option value="">Choose a batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weekly timetable file
          <input
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
          />
        </label>
      </div>
      {!batches.length && (
        <p className="empty-copy">
          Link subjects to a semester batch in Semester setup before uploading
          its timetable.
        </p>
      )}
      <div className="action-row">
        <a className="secondary-button" href={timetableApi.batchTemplate}>
          Download CSV template
        </a>
        <button
          type="button"
          disabled={busy || !file || !batchId}
          onClick={() => void run()}
        >
          {busy ? 'Checking timetable…' : 'Preview timetable'}
        </button>
      </div>
      <p className="schedule-help">
        Times can use 09:00 or 9:00 AM. Optional dates use YYYY-MM-DD or
        DD/MM/YYYY. Holidays and working Saturdays follow the semester calendar.
        Existing classes are kept; matching rows are not duplicated.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview && (
        <>
          <h3>
            {saved
              ? 'Timetable imported'
              : `${preview.rows.length} matched weekly classes`}
          </h3>
          {!!preview.errors.length && (
            <div role="alert" className="form-error">
              <strong>Correct these rows before importing</strong>
              <ul>
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    {e.source}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!preview.rows.length && (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Batch timetable preview"
            >
              <table>
                <thead>
                  <tr>
                    <th>Subject / Teacher</th>
                    <th>Day and time</th>
                    <th>Repeat dates</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{r.subject}</strong>
                        <br />
                        {r.teacher}
                      </td>
                      <td>
                        {weekdays[r.weekday]}
                        <br />
                        {r.startTime} – {r.endTime}
                      </td>
                      <td>
                        {r.effectiveFrom}
                        <br />
                        {r.effectiveTo}
                      </td>
                      <td>
                        {r.existing
                          ? 'Already exists'
                          : saved
                            ? 'Added'
                            : 'Add class'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {saved ? (
            <p role="status">
              {preview.added} weekly classes added.{' '}
              {preview.warnings?.length
                ? 'Some class dates need attention below.'
                : 'Class dates are updated using the semester calendar.'}
            </p>
          ) : (
            <button
              type="button"
              disabled={busy || !preview.valid}
              onClick={() => void run(true)}
            >
              Confirm batch timetable
            </button>
          )}
          {preview.warnings?.map((w, i) => (
            <p role="alert" className="form-error" key={i}>
              {w}
            </p>
          ))}
        </>
      )}
    </details>
  );
}
