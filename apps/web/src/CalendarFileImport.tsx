import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { academicApi } from './academic';
import { apiFetch, apiUrl } from './http';

type Entry = {
  title: string;
  start: string;
  end: string;
  kind: string;
  teachingAllowed: boolean;
  examType: string;
  deadline?: string;
  deadlineDefaulted?: boolean;
  evidence: string;
  concern: string;
};
type Preview = {
  token: string;
  entries: Entry[];
  warnings: string[];
  verified: boolean;
  method?: 'direct' | 'ai';
  progress?: {
    completed: number;
    total: number;
    section: number;
    sections: number;
    phase: string;
  };
};
function preparePreview(preview: Preview): Preview {
  return {
    ...preview,
    entries: preview.entries.map((entry) =>
      entry.kind === 'EXAM' && !entry.deadline
        ? { ...entry, deadline: entry.start, deadlineDefaulted: true }
        : entry,
    ),
  };
}
function calendarIssues(
  entries: Entry[],
  semesterStart: string,
  semesterEnd: string,
) {
  const validDate = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  return entries.map((entry, index) => {
    const problems: string[] = [];
    if (!entry.title.trim()) problems.push('Enter an event title.');
    else if (entry.title.trim().length > 160)
      problems.push('Keep the title within 160 characters.');
    const datesValid = validDate(entry.start) && validDate(entry.end);
    if (!datesValid) problems.push('Choose a valid start and end date.');
    else if (entry.end < entry.start)
      problems.push('End date must be on or after the start date.');
    else if (entry.start < semesterStart || entry.end > semesterEnd)
      problems.push(
        `Outside this semester (${semesterStart} to ${semesterEnd}). Correct the dates or remove this entry.`,
      );
    if (
      entry.kind === 'EXAM' &&
      (!entry.deadline ||
        !validDate(entry.deadline) ||
        entry.deadline < semesterStart ||
        entry.deadline > entry.start)
    )
      problems.push(
        'Syllabus deadline must be within the semester and on or before the exam starts.',
      );
    if (
      datesValid &&
      entries.some(
        (other, i) =>
          i !== index &&
          validDate(other.start) &&
          validDate(other.end) &&
          entry.start <= other.end &&
          entry.end >= other.start,
      )
    )
      problems.push(
        'These dates overlap another entry. Combine the events or correct their dates before saving.',
      );
    if (
      entry.kind === 'EXAM' &&
      entries.some(
        (other, i) =>
          i !== index && other.kind === 'EXAM' && other.title === entry.title,
      )
    )
      problems.push(
        'Another exam has this name. Use a distinct name or combine its dates.',
      );
    return problems;
  });
}
async function request(
  path: string,
  body?: FormData | object,
  signal?: AbortSignal,
) {
  const response = await apiFetch(`${apiUrl}/imports/calendar/${path}`, {
    method: 'POST',
    signal,
    ...(body instanceof FormData
      ? { body }
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join(' ')
        : result.message ||
            'The calendar request could not be completed. Please retry.',
    );
  return result;
}
export function CalendarFileImport({ campusId }: { campusId?: string }) {
  const client = useQueryClient();
  const reading = useRef<AbortController | null>(null);
  const entryCards = useRef<Array<HTMLDetailsElement | null>>([]);
  useEffect(() => () => reading.current?.abort(), []);
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId!),
    enabled: !!campusId,
  });
  const [semesterId, setSemesterId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const semester = semesters.data?.find((s) => s.id === semesterId);
  const issues = calendarIssues(
    preview?.entries || [],
    semester?.startDate.slice(0, 10) || '',
    semester?.endDate.slice(0, 10) || '',
  );
  const issueCount = issues.filter((problems) => problems.length).length;
  const outsideCount =
    preview?.entries.filter(
      (entry) =>
        semester &&
        (entry.end < semester.startDate.slice(0, 10) ||
          entry.start > semester.endDate.slice(0, 10)),
    ).length || 0;
  function reset() {
    setPreview(null);
    setReviewed(false);
    setMessage('');
    setError('');
  }
  async function verify(p: Preview) {
    const controller = reading.current || new AbortController();
    reading.current = controller;
    let current = p;
    while (!current.verified && !controller.signal.aborted) {
      const progress = current.progress;
      setBusy(
        progress
          ? `${progress.phase === 'checking' ? 'Checking' : 'Reading'} calendar section ${progress.section} of ${progress.sections}…`
          : 'Double-checking dates against the file…',
      );
      const next = (await request(
        `${p.token}/verify`,
        undefined,
        controller.signal,
      )) as Preview;
      setPreview(preparePreview(next));
      if (
        !next.verified &&
        progress &&
        next.progress &&
        next.progress.completed <= progress.completed
      )
        throw new Error(
          'Calendar checking paused. Retry verification to continue.',
        );
      current = next;
    }
  }
  async function read() {
    if (!file || !semesterId) return;
    reset();
    reading.current?.abort();
    reading.current = new AbortController();
    setBusy('Reading holidays, events and exams…');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('semesterId', semesterId);
      const result = (await request(
        'preview',
        form,
        reading.current.signal,
      )) as Preview;
      setPreview(preparePreview(result));
      await verify(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to read this calendar.',
      );
    } finally {
      setBusy('');
    }
  }
  async function save() {
    if (!preview || !preview.verified || !reviewed || issueCount) return;
    setBusy('Saving dates and recalculating teaching sessions…');
    setError('');
    try {
      const result = await request(`${preview.token}/commit`, {
        entries: preview.entries,
        reviewed,
      });
      setMessage(result.message);
      await Promise.all(
        [
          'academic',
          'timetable',
          'topic-schedules',
          'progress-dashboard',
          'exam-readiness',
          'student-overview',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save calendar.');
    } finally {
      setBusy('');
    }
  }
  function edit(index: number, changes: Partial<Entry>) {
    setReviewed(false);
    setMessage('');
    setError('');
    setPreview(
      (p) =>
        p && {
          ...p,
          entries: p.entries.map((e, i) =>
            i === index
              ? {
                  ...e,
                  ...changes,
                  ...(changes.start && (!e.end || e.end === e.start)
                    ? { end: changes.start }
                    : {}),
                  ...(changes.start && e.deadlineDefaulted
                    ? { deadline: changes.start }
                    : {}),
                  ...(changes.kind === 'EXAM' && !e.deadline
                    ? {
                        deadline: changes.start || e.start,
                        deadlineDefaulted: true,
                      }
                    : {}),
                  ...(changes.deadline !== undefined
                    ? { deadlineDefaulted: false }
                    : {}),
                }
              : e,
          ),
        },
    );
  }
  return (
    <section className="panel calendar-file-import">
      <header>
        <h2>Update calendar from file</h2>
        <p>
          Add holidays, events and exam dates to an existing semester. Only the
          dates you approve below will change.
        </p>
      </header>
      {semesters.isSuccess && !semesters.data.length && (
        <div className="empty-state">
          <h3>Create a semester first</h3>
          <p>
            Open Semester setup, add the semester dates, then return here to
            upload its calendar.
          </p>
        </div>
      )}
      <fieldset disabled={!!busy}>
        <div className="calendar-file-inputs">
          <label>
            1. Choose semester
            <select
              disabled={semesters.isLoading || !semesters.data?.length}
              value={semesterId}
              onChange={(e) => {
                setSemesterId(e.target.value);
                reset();
              }}
            >
              <option value="">
                {semesters.isLoading
                  ? 'Loading semesters…'
                  : 'Select a semester'}
              </option>
              {semesters.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.startDate.slice(0, 10)} –{' '}
                  {s.endDate.slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
          <label>
            2. Upload calendar
            <input
              type="file"
              accept=".pdf,.xlsx,.csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                reset();
              }}
            />
          </label>
        </div>
        {semesters.isError && (
          <p role="alert">Could not load semesters. Please reload the page.</p>
        )}
        {semester && (
          <p className="calendar-file-note">
            Saturday rule:{' '}
            {semester.workingSaturdayRule.replaceAll('_', ' ').toLowerCase()}.
            Unlisted dates stay unchanged, even when the file covers only part
            of the semester. Explicit dates override the normal weekly rule.
          </p>
        )}
        <button type="button" disabled={!file || !semesterId} onClick={read}>
          Read and verify calendar
        </button>
      </fieldset>
      {busy && (
        <div className="calendar-reading-status" role="status">
          <span>{busy}</span>
          {preview?.progress && !preview.verified && (
            <progress
              aria-label="Calendar verification progress"
              value={preview.progress.completed}
              max={preview.progress.total || 1}
            />
          )}
          <small>
            {preview?.verified
              ? 'Your changes are being saved.'
              : 'You can leave this page open. Verification continues automatically.'}
          </small>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {message.includes('could not finish') && (
        <button type="button" disabled={!!busy} onClick={save}>
          Retry timetable recalculation
        </button>
      )}
      {preview && (
        <fieldset disabled={!!busy || !!message}>
          <h3>Review {preview.entries.length} detected entries</h3>
          <p>
            {preview.verified
              ? preview.method === 'direct'
                ? 'CSV dates and events read directly. Check any flagged rows and review the entries before saving.'
                : 'AI reading and verification completed. Check the dates and resolve any concerns before saving.'
              : 'Calendar reading and verification are in progress. Nothing has been saved.'}
          </p>
          {!preview.verified && !busy && (
            <button
              type="button"
              onClick={async () => {
                setError('');
                reading.current = new AbortController();
                try {
                  await verify(preview);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy('');
                }
              }}
            >
              Continue verification
            </button>
          )}
          {preview.verified && (
            <p className="calendar-deadline-note">
              Exam syllabus deadlines use the exam start date when the file does
              not supply one. You can change each deadline below.
            </p>
          )}
          {preview.warnings.length > 0 && preview.verified && (
            <details className="calendar-source-notes">
              <summary>File notes ({preview.warnings.length})</summary>
              <ul>
                {preview.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.verified && issueCount > 0 && (
            <div className="calendar-validation-summary" role="alert">
              <div>
                <strong>
                  {issueCount}{' '}
                  {issueCount === 1 ? 'entry needs' : 'entries need'} attention
                </strong>
                <p>
                  Correct the marked fields or remove entries you do not want to
                  import.
                </p>
              </div>
              <div className="calendar-action-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const card =
                      entryCards.current[
                        issues.findIndex((item) => item.length)
                      ];
                    if (card) {
                      card.open = true;
                      card.scrollIntoView({ block: 'center' });
                    }
                  }}
                >
                  Go to first issue
                </button>
                {outsideCount > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setReviewed(false);
                      setError('');
                      setPreview(
                        (p) =>
                          p && {
                            ...p,
                            entries: p.entries.filter(
                              (entry) =>
                                entry.end >= semester!.startDate.slice(0, 10) &&
                                entry.start <= semester!.endDate.slice(0, 10),
                            ),
                          },
                      );
                    }}
                  >
                    Remove {outsideCount}{' '}
                    {outsideCount === 1 ? 'entry' : 'entries'} outside semester
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="calendar-file-entries" hidden={!preview.verified}>
            {preview.entries.map((e, i) => {
              return (
                <details
                  className={`calendar-file-entry${issues[i]?.length ? ' has-issues' : ''}`}
                  key={i}
                  ref={(element) => {
                    entryCards.current[i] = element;
                  }}
                  open={!!issues[i]?.length || preview.entries.length === 1}
                >
                  <summary className="calendar-entry-summary">
                    <span className="calendar-entry-number">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>
                      <strong>{e.title || 'New calendar entry'}</strong>
                      <small>
                        {e.start || 'Choose date'}
                        {e.end && e.end !== e.start ? ` – ${e.end}` : ''} ·{' '}
                        {e.kind.replaceAll('_', ' ').toLowerCase()}
                      </small>
                    </span>
                    <span
                      className={`calendar-entry-state${issues[i]?.length ? ' needs-attention' : ''}`}
                    >
                      {issues[i]?.length
                        ? 'Needs attention'
                        : e.concern
                          ? 'Check source'
                          : 'Ready'}
                    </span>
                  </summary>
                  <div className="calendar-entry-fields">
                    <div className="calendar-file-entry-heading">
                      <strong>Edit entry {i + 1}</strong>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setReviewed(false);
                          setError('');
                          setPreview(
                            (p) =>
                              p && {
                                ...p,
                                entries: p.entries.filter((_, j) => i !== j),
                              },
                          );
                        }}
                      >
                        Remove entry
                      </button>
                    </div>
                    {!!issues[i]?.length && (
                      <ul className="calendar-entry-errors">
                        {issues[i]!.map((problem) => (
                          <li key={problem}>{problem}</li>
                        ))}
                      </ul>
                    )}
                    <label>
                      Title
                      <input
                        maxLength={160}
                        value={e.title}
                        onChange={(v) => edit(i, { title: v.target.value })}
                      />
                    </label>
                    <div className="calendar-file-inputs">
                      <label>
                        From
                        <input
                          type="date"
                          min={semester?.startDate.slice(0, 10)}
                          max={semester?.endDate.slice(0, 10)}
                          value={e.start}
                          onChange={(v) => edit(i, { start: v.target.value })}
                        />
                      </label>
                      <label>
                        To
                        <input
                          type="date"
                          min={e.start || semester?.startDate.slice(0, 10)}
                          max={semester?.endDate.slice(0, 10)}
                          value={e.end}
                          onChange={(v) => edit(i, { end: v.target.value })}
                        />
                      </label>
                      <label>
                        Type
                        <select
                          value={e.kind}
                          onChange={(v) =>
                            edit(i, {
                              kind: v.target.value,
                              teachingAllowed: [
                                'HOLIDAY',
                                'CAMPUS_CLOSED',
                                'EXAM',
                              ].includes(v.target.value)
                                ? false
                                : v.target.value === 'EXTRA_WORKING_DAY'
                                  ? true
                                  : e.teachingAllowed,
                            })
                          }
                        >
                          {[
                            'HOLIDAY',
                            'EVENT',
                            'EXTRA_WORKING_DAY',
                            'CAMPUS_CLOSED',
                            'EXAM',
                          ].map((k) => (
                            <option key={k} value={k}>
                              {k.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {e.kind === 'EXAM' && (
                      <div className="calendar-file-inputs">
                        <label>
                          Exam type
                          <select
                            value={e.examType}
                            onChange={(v) =>
                              edit(i, { examType: v.target.value })
                            }
                          >
                            {[
                              'SESSIONAL',
                              'MID_TERM',
                              'PUT',
                              'END_TERM',
                              'OTHER',
                            ].map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Syllabus deadline
                          <input
                            type="date"
                            value={e.deadline || ''}
                            max={e.start}
                            min={semester?.startDate.slice(0, 10)}
                            onChange={(v) =>
                              edit(i, { deadline: v.target.value })
                            }
                          />
                          <small>
                            {e.deadlineDefaulted
                              ? 'Defaults to the exam start date; choose an earlier date if needed.'
                              : 'Syllabus coverage must finish by this date.'}
                          </small>
                        </label>
                      </div>
                    )}
                    {!['HOLIDAY', 'CAMPUS_CLOSED'].includes(e.kind) && (
                      <label className="calendar-file-check">
                        <input
                          type="checkbox"
                          checked={e.teachingAllowed}
                          onChange={(v) =>
                            edit(i, { teachingAllowed: v.target.checked })
                          }
                        />
                        Regular teaching is allowed on these dates
                      </label>
                    )}
                    {e.concern && (
                      <p className="calendar-file-warnings">
                        Check: {e.concern}
                      </p>
                    )}
                    <details>
                      <summary>Source evidence</summary>
                      <p>
                        {e.evidence ||
                          'No evidence provided — check this entry against the original file.'}
                      </p>
                    </details>
                  </div>
                </details>
              );
            })}
          </div>
          {preview.verified && (
            <div className="calendar-review-footer">
              <div className="calendar-action-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setReviewed(false);
                    setError('');
                    setPreview(
                      (p) =>
                        p && {
                          ...p,
                          entries: [
                            ...p.entries,
                            {
                              title: '',
                              start: '',
                              end: '',
                              kind: 'EVENT',
                              teachingAllowed: true,
                              examType: 'OTHER',
                              evidence: 'Manually added during review',
                              concern: '',
                            },
                          ],
                        },
                    );
                  }}
                >
                  Add a missing date
                </button>
                <span className="calendar-review-count">
                  {preview.entries.length} entries ·{' '}
                  {issueCount
                    ? `${issueCount} ${issueCount === 1 ? 'needs' : 'need'} attention`
                    : 'Ready for your review'}
                </span>
              </div>
              <label className="calendar-file-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I checked the source, corrected ambiguous dates and approved
                replacing existing entries on these dates.
              </label>
              <button
                type="button"
                disabled={
                  !preview.verified ||
                  !reviewed ||
                  !preview.entries.length ||
                  issueCount > 0
                }
                onClick={save}
              >
                Save calendar changes
              </button>
            </div>
          )}
        </fieldset>
      )}
    </section>
  );
}
