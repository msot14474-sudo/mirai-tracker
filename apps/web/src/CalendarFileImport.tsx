import { useState } from 'react';
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
  evidence: string;
  concern: string;
};
type Preview = {
  token: string;
  entries: Entry[];
  warnings: string[];
  verified: boolean;
};
async function request(path: string, body?: FormData | object) {
  const response = await apiFetch(`${apiUrl}/imports/calendar/${path}`, {
    method: 'POST',
    ...(body instanceof FormData
      ? { body }
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        }),
  });
  return response.json();
}
export function CalendarFileImport({ campusId }: { campusId?: string }) {
  const client = useQueryClient();
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
  function reset() {
    setPreview(null);
    setReviewed(false);
    setMessage('');
    setError('');
  }
  async function verify(p: Preview) {
    setBusy('Double-checking dates against the file…');
    const result = (await request(`${p.token}/verify`)) as Preview;
    setPreview(result);
  }
  async function read() {
    if (!file || !semesterId) return;
    reset();
    setBusy('Reading holidays, events and exams…');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('semesterId', semesterId);
      const result = (await request('preview', form)) as Preview;
      setPreview(result);
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
    if (!preview) return;
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
    setPreview(
      (p) =>
        p && {
          ...p,
          entries: p.entries.map((e, i) =>
            i === index ? { ...e, ...changes } : e,
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
      <fieldset disabled={!!busy}>
        <div className="calendar-file-inputs">
          <label>
            1. Choose semester
            <select
              value={semesterId}
              onChange={(e) => {
                setSemesterId(e.target.value);
                reset();
              }}
            >
              <option value="">Select a semester</option>
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
      {busy && <p role="status">{busy}</p>}
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
              ? 'Two AI passes completed. Check the dates and resolve any concerns before saving.'
              : 'Second verification is not complete. Nothing has been saved.'}
          </p>
          {!preview.verified && (
            <button
              type="button"
              onClick={async () => {
                setError('');
                try {
                  await verify(preview);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy('');
                }
              }}
            >
              Retry verification
            </button>
          )}
          {preview.warnings.length > 0 && (
            <ul className="calendar-file-warnings">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <div className="calendar-file-entries">
            {preview.entries.map((e, i) => {
              const outside =
                semester &&
                (e.start < semester.startDate.slice(0, 10) ||
                  e.end > semester.endDate.slice(0, 10));
              return (
                <article className="calendar-file-entry" key={i}>
                  <div className="calendar-file-entry-heading">
                    <strong>Entry {i + 1}</strong>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setReviewed(false);
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
                  <label>
                    Title
                    <input
                      value={e.title}
                      onChange={(v) => edit(i, { title: v.target.value })}
                    />
                  </label>
                  <div className="calendar-file-inputs">
                    <label>
                      From
                      <input
                        type="date"
                        value={e.start}
                        onChange={(v) => edit(i, { start: v.target.value })}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
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
                          Choose when syllabus coverage must finish.
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
                  {outside && (
                    <p role="alert">
                      Outside the selected semester. Remove this entry or
                      correct its dates.
                    </p>
                  )}
                  {e.concern && (
                    <p className="calendar-file-warnings">Check: {e.concern}</p>
                  )}
                  <details>
                    <summary>Source evidence</summary>
                    <p>
                      {e.evidence ||
                        'No evidence provided — check this entry against the original file.'}
                    </p>
                  </details>
                </article>
              );
            })}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setReviewed(false);
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
            disabled={!preview.verified || !reviewed || !preview.entries.length}
            onClick={save}
          >
            Save calendar changes
          </button>
        </fieldset>
      )}
    </section>
  );
}
