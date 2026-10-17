import { CourseProgressImport } from './CourseProgressImport';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, FormEvent, useState } from 'react';
import { ImportCounts, ImportPreview, importApi } from './imports';

const countLabels: Array<[keyof ImportCounts, string]> = [
  ['campuses', 'Campuses'],
  ['semesters', 'Semesters'],
  ['batches', 'Batches'],
  ['subjects', 'Subjects'],
  ['offerings', 'Offerings'],
  ['calendarDays', 'Calendar days'],
];

export function SemesterImport({ campusId }: { campusId?: string }) {
  const [mode, setMode] = useState('progress');
  return (
    <>
      <div className="import-mode-picker" role="group" aria-label="Import type">
        <button
          className={mode === 'progress' ? 'selected' : ''}
          aria-pressed={mode === 'progress'}
          type="button"
          onClick={() => setMode('progress')}
        >
          Import course data
        </button>
        <button
          className={mode === 'setup' ? 'selected' : ''}
          aria-pressed={mode === 'setup'}
          type="button"
          onClick={() => setMode('setup')}
        >
          Semester setup template
        </button>
      </div>
      {mode === 'setup' ? (
        <SemesterSetupImport campusId={campusId} />
      ) : (
        <CourseProgressImport campusId={campusId} />
      )}
    </>
  );
}

function SemesterSetupImport({ campusId }: { campusId?: string }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const jobs = useQuery({
    queryKey: ['imports', 'jobs', campusId],
    queryFn: () => importApi.jobs(campusId),
  });
  const previewMutation = useMutation({
    mutationFn: (selected: File) => importApi.preview(selected, campusId),
    onSuccess: setPreview,
  });
  const importMutation = useMutation({
    mutationFn: (selected: File) => importApi.execute(selected, campusId),
    onSuccess: async (result) => {
      if (result.preview) setPreview(result.preview);
      await queryClient.invalidateQueries({
        queryKey: ['imports', 'jobs', campusId],
      });
      await queryClient.invalidateQueries({ queryKey: ['academic'] });
    },
  });

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    importMutation.reset();
  };

  const validate = (event: FormEvent) => {
    event.preventDefault();
    if (file) previewMutation.mutate(file);
  };

  return (
    <section className="import-workspace" aria-labelledby="import-title">
      <div className="workspace-heading">
        <div>
          <h2 id="import-title">Semester import</h2>
        </div>
        <div className="template-actions" aria-label="Import templates">
          <a href={importApi.templateUrl('xlsx')}>Download Excel template</a>
          <a href={importApi.templateUrl('csv')}>Download CSV template</a>
        </div>
      </div>

      <div className="import-layout">
        <form className="import-card upload-card" onSubmit={validate}>
          <span className="feature-number">01</span>
          <h3>Choose semester data</h3>
          <p>
            For semester dates, batches and subjects, use the supplied template.
            Already tracking completed lessons? Choose Import course data above.
          </p>
          <label className="file-picker">
            <span className="file-picker-label">CSV or Excel file</span>
            <span className="file-picker-control">
              <input
                type="file"
                aria-label="CSV or Excel file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={chooseFile}
                required
              />
              <span className="file-picker-button" aria-hidden="true">
                Choose file
              </span>
              <span className="file-picker-name" title={file?.name}>
                {file?.name ?? 'No file chosen'}
              </span>
            </span>
          </label>
          {file ? (
            <div className="selected-file">
              <strong>{file.name}</strong>
              <span>{formatBytes(file.size)}</span>
            </div>
          ) : null}
          <button type="submit" disabled={!file || previewMutation.isPending}>
            {previewMutation.isPending
              ? 'Checking every row…'
              : 'Validate file'}
          </button>
          {previewMutation.error ? (
            <p className="form-error" role="alert">
              {previewMutation.error.message}
            </p>
          ) : null}
        </form>

        <div className="import-card preview-card">
          <span className="feature-number">02</span>
          <h3>Validation preview</h3>
          {!preview ? (
            <p className="empty-copy">
              Select a template file to see record totals and row-level
              validation.
            </p>
          ) : (
            <>
              <div
                className={`validation-banner ${preview.valid ? 'valid' : 'invalid'}`}
                role="status"
              >
                <strong>
                  {preview.valid
                    ? 'Ready to import'
                    : `${preview.issues.length} issue${preview.issues.length === 1 ? '' : 's'} found`}
                </strong>
                <span>
                  {preview.valid
                    ? 'No database changes have been made yet.'
                    : 'Correct the marked rows and validate the file again.'}
                </span>
              </div>
              <div className="import-counts">
                {countLabels.map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>{preview.counts[key]}</strong>
                  </div>
                ))}
              </div>
              {preview.issues.length ? (
                <div className="issue-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Column</th>
                        <th>Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.issues.slice(0, 50).map((entry, index) => (
                        <tr
                          key={`${entry.sheet}-${entry.rowNumber}-${entry.columnName}-${index}`}
                        >
                          <td>
                            {entry.sheet} · row {entry.rowNumber || 'file'}
                          </td>
                          <td>{entry.columnName ?? '—'}</td>
                          <td>{entry.errorMessage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <button
                onClick={() => file && importMutation.mutate(file)}
                disabled={!preview.valid || !file || importMutation.isPending}
              >
                {importMutation.isPending
                  ? 'Importing atomically…'
                  : 'Confirm semester import'}
              </button>
            </>
          )}
          {importMutation.error ? (
            <p className="form-error" role="alert">
              {importMutation.error.message}
            </p>
          ) : null}
          {importMutation.data?.job.status === 'COMPLETED' ? (
            <p className="import-success" role="status">
              Import complete. {importMutation.data.job.successfulRows} rows
              were committed.
            </p>
          ) : null}
        </div>
      </div>

      <div className="import-history">
        <div className="subheading-row">
          <h3>Recent imports</h3>
          <span>{jobs.data?.length ?? 0} recorded</span>
        </div>
        {jobs.isError ? (
          <p className="form-error" role="alert">
            {jobs.error.message}
          </p>
        ) : jobs.data?.length ? (
          jobs.data.map((job) => (
            <div className="import-history-row" key={job.id}>
              <div>
                <strong>{job.fileName}</strong>
                <span>
                  {new Date(job.createdAt).toLocaleString()} ·{' '}
                  {job.uploadedBy.name}
                </span>
              </div>
              <span className={`job-status ${job.status.toLowerCase()}`}>
                {job.status.replaceAll('_', ' ')}
              </span>
              <b>
                {job.successfulRows}/{job.totalRows} rows
              </b>
              {job.failedRows ? (
                <a href={importApi.errorReportUrl(job.id)}>Error report</a>
              ) : null}
            </div>
          ))
        ) : (
          <p className="empty-copy">No semester imports have run yet.</p>
        )}
      </div>
    </section>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} bytes`;
  return `${(value / 1024).toFixed(1)} KB`;
}
