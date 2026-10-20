import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CampusDataScope } from './CampusDataScope';
import {
  BundlePreview,
  campusDataKeys,
  campusDownload,
  campusRequest,
} from './campusData';
import { SubjectProgress } from './progress';
import { LoadingSkeleton } from './LoadingSkeleton';

export function FullSemesterImport({
  initialCampusId,
}: {
  initialCampusId?: string;
}) {
  return (
    <CampusDataScope
      initialCampusId={initialCampusId}
      title="Full semester import"
      description="Bring your campus records together. Preview the links, import your files, then review the results."
    >
      {(semester) => <SemesterBundle semesterId={semester.id} />}
    </CampusDataScope>
  );
}
function SemesterBundle({ semesterId }: { semesterId: string }) {
  const client = useQueryClient();
  const [tab, setTab] = useState<'upload' | 'analysis' | 'history'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [saved, setSaved] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const path = `/semesters/${semesterId}`;
  const download = useMutation({
    mutationFn: ({ url, name }: { url: string; name: string }) =>
      campusDownload(url, name),
  });
  const inspect = useMutation({
    mutationFn: async (commit: boolean) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      if (commit && preview) form.append('fingerprint', preview.fingerprint);
      return campusRequest<BundlePreview>(
        `${path}/${commit ? 'import' : 'preview'}`,
        { method: 'POST', body: form },
      );
    },
    onSuccess: async (data, commit) => {
      setPreview(data);
      setSaved(!!commit && data.valid && !!data.importId);
      if (commit && data.valid)
        await Promise.all(
          campusDataKeys.map((key) =>
            client.invalidateQueries({ queryKey: [key] }),
          ),
        );
    },
  });
  const history = useQuery({
    queryKey: ['campus-data', 'imports', semesterId],
    queryFn: () =>
      campusRequest<
        {
          id: string;
          fileNames: string;
          counts: Record<string, number>;
          createdAt: string;
        }[]
      >(`${path}/imports`),
    enabled: tab === 'history' || saved,
  });
  return (
    <>
      <div
        className="campus-data-tabs"
        role="group"
        aria-label="Semester import views"
      >
        {(['upload', 'analysis', 'history'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'upload'
              ? 'Import files'
              : t === 'analysis'
                ? 'Semester analysis'
                : 'Import history'}
          </button>
        ))}
      </div>
      {download.error && (
        <p className="form-error" role="alert">
          {download.error.message}
        </p>
      )}
      {tab === 'upload' && (
        <>
          <div className="campus-data-card">
            <div className="campus-data-card-heading">
              <div>
                <h3>1. Prepare your semester files</h3>
                <p>
                  Use one Excel workbook with separate sheets, or select several
                  CSV files together.
                </p>
              </div>
              <div className="campus-data-actions">
                {(['xlsx', 'csv'] as const).map((ext) => (
                  <button
                    className="secondary-button"
                    key={ext}
                    disabled={download.isPending}
                    onClick={() =>
                      download.mutate({
                        url: `/template?format=${ext}`,
                        name: `mirai-full-semester-template.${ext}`,
                      })
                    }
                  >
                    {ext === 'xlsx' ? 'Excel template' : 'CSV template'}
                  </button>
                ))}
              </div>
            </div>
            <div className="campus-data-coverage">
              {[
                'Subjects & batches',
                'Faculty assignments',
                'Calendar & exams',
                'Weekly timetable',
                'Lesson plans',
                'Class logs',
                'Rates & expenses',
                'Payment records',
              ].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <p className="campus-data-note">
              Faculty emails must already have access to this campus. Only the
              records in your files are imported. Existing class history is
              preserved, and unlisted calendar dates keep their current rules.
            </p>
          </div>
          <div className="campus-data-card">
            <h3>2. Choose files and preview</h3>
            <label className="campus-data-upload">
              Excel or CSV files
              <input
                key={fileKey}
                type="file"
                multiple
                accept=".xlsx,.csv"
                disabled={inspect.isPending}
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []));
                  setPreview(null);
                  setSaved(false);
                  inspect.reset();
                }}
              />
            </label>
            <p className="campus-data-note">
              For CSV, use the dataset column or name each file Subjects,
              Faculty, Calendar, Exams, Timetable, Lessons, Sessions, Rates,
              Expenses or Payments. Read Me and instruction sheets are skipped.
            </p>
            {!!files.length && (
              <ul className="campus-data-files">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <span>
                      {f.name}
                      <small>{Math.max(1, Math.round(f.size / 1024))} KB</small>
                    </span>
                    <button
                      className="secondary-button"
                      disabled={inspect.isPending}
                      onClick={() => {
                        setFiles(files.filter((_, n) => n !== i));
                        setPreview(null);
                        setSaved(false);
                        setFileKey((n) => n + 1);
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="campus-data-actions">
              <button
                className="primary-button"
                disabled={!files.length || inspect.isPending}
                onClick={() => {
                  setSaved(false);
                  inspect.mutate(false);
                }}
              >
                {inspect.isPending ? 'Checking records…' : 'Preview import'}
              </button>
            </div>
            {inspect.isPending && (
              <p role="status" className="campus-data-note">
                Checking campus links, dates and conflicts. Your files stay here
                while this finishes.
              </p>
            )}
            {inspect.error && (
              <p className="form-error" role="alert">
                {inspect.error.message}
              </p>
            )}
          </div>
          {preview && (
            <div className="campus-data-card">
              <h3>3. Review your import</h3>
              <div className="campus-data-counts">
                {Object.entries(preview.counts)
                  .filter(([, n]) => n > 0)
                  .map(([name, n]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <strong>{n}</strong>
                    </div>
                  ))}
              </div>
              {preview.issues.length > 0 && (
                <div className="form-error" role="alert">
                  <strong>Correct these records, then preview again.</strong>
                  <ul>
                    {preview.issues.map((i, n) => (
                      <li key={n}>
                        <b>{i.location}</b>: {i.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <details className="campus-data-notice">
                  <summary>{preview.warnings.length} notes to review</summary>
                  <ul>
                    {preview.warnings.map((i, n) => (
                      <li key={n}>
                        <b>{i.location}</b>: {i.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {preview.skippedSheets.length > 0 && (
                <p className="campus-data-note">
                  Skipped guidance sheets: {preview.skippedSheets.join(', ')}
                </p>
              )}
              {Object.entries(preview.counts)
                .filter(([, n]) => n > 0)
                .map(([dataset, n]) => {
                  const records = preview.rows.filter(
                    (r) => r.dataset === dataset,
                  );
                  const keys = [
                    ...new Set(records.flatMap((r) => Object.keys(r.values))),
                  ].filter((k) => k !== 'dataset');
                  return (
                    <details className="campus-data-preview" key={dataset}>
                      <summary>
                        {dataset} <span>{n} records</span>
                      </summary>
                      <div
                        className="campus-data-table-wrap"
                        role="region"
                        aria-label={`${dataset} preview`}
                        tabIndex={0}
                      >
                        <table>
                          <thead>
                            <tr>
                              <th>Source</th>
                              {keys.map((k) => (
                                <th key={k}>{k.replaceAll('_', ' ')}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {records.map((r, i) => (
                              <tr key={i}>
                                <td>{r.location}</td>
                                {keys.map((k) => (
                                  <td key={k}>{r.values[k] || '—'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  );
                })}
              {saved ? (
                <p className="form-success" role="status">
                  Semester data imported. Your timetable, faculty views and
                  analysis now use these records.
                </p>
              ) : preview.alreadyImported ? (
                <p className="form-success" role="status">
                  These records were already imported. No duplicates will be
                  created.
                </p>
              ) : (
                <div className="campus-data-actions">
                  <button
                    className="primary-button"
                    disabled={!preview.valid || inspect.isPending}
                    onClick={() => inspect.mutate(true)}
                  >
                    {inspect.isPending
                      ? 'Importing…'
                      : 'Confirm semester import'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {tab === 'analysis' && <SemesterAnalysis semesterId={semesterId} />}
      {tab === 'history' && (
        <div className="campus-data-card">
          <h3>Import history</h3>
          {history.isPending ? (
            <LoadingSkeleton variant="list" />
          ) : history.error ? (
            <p className="form-error" role="alert">
              {history.error.message}
            </p>
          ) : !history.data?.length ? (
            <p>No semester imports yet.</p>
          ) : (
            <div className="campus-data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Imported</th>
                    <th>Files</th>
                    <th>Records</th>
                    <th>Source archive</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((h) => (
                    <tr key={h.id}>
                      <td>{new Date(h.createdAt).toLocaleString()}</td>
                      <td>{h.fileNames}</td>
                      <td>
                        {Object.values(h.counts).reduce((a, b) => a + b, 0)}
                      </td>
                      <td>
                        <button
                          className="secondary-button"
                          disabled={download.isPending}
                          onClick={() =>
                            download.mutate({
                              url: `${path}/imports/${h.id}/source?format=xlsx`,
                              name: 'semester-import-source.xlsx',
                            })
                          }
                        >
                          Download Excel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
function SemesterAnalysis({ semesterId }: { semesterId: string }) {
  const query = useQuery({
    queryKey: ['campus-data', 'analysis', semesterId],
    queryFn: () =>
      campusRequest<{ subjects: SubjectProgress[] }>(
        `/semesters/${semesterId}/analysis`,
      ),
    refetchInterval: 30000,
  });
  if (query.isPending) return <LoadingSkeleton variant="cards" />;
  if (query.error)
    return (
      <p className="form-error" role="alert">
        {query.error.message}
      </p>
    );
  const subjects = query.data?.subjects ?? [],
    hours = subjects.reduce((n, s) => n + s.hoursInScope, 0),
    covered = subjects.reduce((n, s) => n + s.coveredHours, 0);
  return (
    <div className="campus-data-card">
      <h3>Semester progress</h3>
      <p>
        Live calculations from the lesson plans, class logs and available
        teaching time. Subjects need a lesson plan before coverage can be
        calculated.
      </p>
      <div className="campus-data-counts">
        <div>
          <span>Subjects with plans</span>
          <strong>{subjects.length}</strong>
        </div>
        <div>
          <span>Planned hours</span>
          <strong>{hours.toFixed(1)}h</strong>
        </div>
        <div>
          <span>Covered hours</span>
          <strong>{covered.toFixed(1)}h</strong>
        </div>
        <div>
          <span>Coverage</span>
          <strong>
            {hours ? `${Math.round((covered / hours) * 100)}%` : '—'}
          </strong>
        </div>
      </div>
      {subjects.length ? (
        <div className="campus-data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject / batch</th>
                <th>Coverage</th>
                <th>Remaining</th>
                <th>Available</th>
                <th>Buffer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.subject.name}</strong>
                    <small>{s.batch.name}</small>
                  </td>
                  <td>
                    <progress value={s.coveragePercentage} max={100} />
                    <span>{s.coveragePercentage.toFixed(1)}%</span>
                  </td>
                  <td>{s.remainingHours.toFixed(1)}h</td>
                  <td>{s.availableHours.toFixed(1)}h</td>
                  <td>{s.bufferRatio?.toFixed(2) ?? '—'}</td>
                  <td>
                    <span
                      className={`campus-data-badge ${s.status.toLowerCase()}`}
                    >
                      {s.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="campus-data-empty">
          Import or upload a lesson plan to see semester coverage here.
        </p>
      )}
    </div>
  );
}
