import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ExportRequest, exportApi, saveDownload } from './exports';

const typeLabels: Record<ExportRequest['type'], string> = {
  FULL_DATA: 'Full data archive',
  CAMPUS_PROGRESS: 'Campus progress',
  SUBJECT_PROGRESS: 'Subject progress',
  VISITING_FACULTY_HONORARIUM: 'Visiting faculty honorarium',
};

export function ExportCenter() {
  const queryClient = useQueryClient();
  const [asOf, setAsOf] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [ratePerLecture, setRatePerLecture] = useState('1500');
  const [downloaded, setDownloaded] = useState('');
  const history = useQuery({
    queryKey: ['exports'],
    queryFn: exportApi.history,
  });
  const createExport = useMutation({
    mutationFn: exportApi.download,
    onSuccess: ({ blob, filename }) => {
      saveDownload(blob, filename);
      setDownloaded(filename);
      void queryClient.invalidateQueries({ queryKey: ['exports'] });
    },
  });

  function download(request: ExportRequest) {
    setDownloaded('');
    createExport.mutate(request);
  }

  return (
    <section className="export-center" aria-labelledby="export-center-title">
      <div className="export-heading">
        <div>
          <p className="step-label">M15 · Portable records</p>
          <h2 id="export-center-title">Reports and CSV exports</h2>
          <p>
            Download progress, finance and complete academic records for Excel,
            Google Sheets or college review.
          </p>
        </div>
        <span className="manager-only-badge">Manager only</span>
      </div>

      <div className="export-controls" aria-label="Export date controls">
        <label>
          Progress position date
          <input
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </label>
        <label>
          Honorarium month
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <label>
          Rate per taken lecture (₹)
          <input
            type="number"
            min="0"
            step="1"
            value={ratePerLecture}
            onChange={(event) => setRatePerLecture(event.target.value)}
          />
        </label>
      </div>

      <div className="export-grid">
        <ExportCard
          number="01"
          title="Campus progress"
          description="One roll-up row per campus with coverage, pace, capacity, risk and overdue-topic counts."
          onClick={() => download({ type: 'CAMPUS_PROGRESS', asOf })}
          busy={createExport.isPending}
        />
        <ExportCard
          number="02"
          title="Subject progress"
          description="Every subject with campus, track, batch, hours, buffer, overdue topics and traffic-light status."
          onClick={() => download({ type: 'SUBJECT_PROGRESS', asOf })}
          busy={createExport.isPending}
        />
        <ExportCard
          number="03"
          title="Visiting faculty honorarium"
          description="Monthly planned-versus-taken lecture counts, taught minutes, rate and payable amount."
          onClick={() =>
            download({
              type: 'VISITING_FACULTY_HONORARIUM',
              month,
              ratePerLecture: Number(ratePerLecture),
            })
          }
          busy={createExport.isPending || Number(ratePerLecture) < 0}
        />
        <ExportCard
          number="04"
          title="Full data archive"
          description="A complete long-form CSV of academic, scheduling, teaching, progress and alert records."
          onClick={() => download({ type: 'FULL_DATA' })}
          busy={createExport.isPending}
        />
      </div>

      {createExport.isError ? (
        <p className="form-error" role="alert">
          {createExport.error.message}
        </p>
      ) : downloaded ? (
        <p className="export-success" role="status">
          Downloaded <strong>{downloaded}</strong>
        </p>
      ) : null}

      <section
        className="export-history"
        aria-labelledby="export-history-title"
      >
        <div className="subheading-row">
          <div>
            <p className="step-label">Audit trail</p>
            <h3 id="export-history-title">Recent exports</h3>
          </div>
          <span>{history.data?.length ?? 0} jobs</span>
        </div>
        {history.isLoading ? (
          <p className="workspace-loading">Loading export history…</p>
        ) : history.isError ? (
          <p className="form-error" role="alert">
            {history.error.message}
          </p>
        ) : history.data?.length ? (
          <div className="export-history-list">
            {history.data.map((job) => (
              <article key={job.id}>
                <span
                  className={`export-job-status ${job.status.toLowerCase()}`}
                >
                  {job.status.replaceAll('_', ' ')}
                </span>
                <div>
                  <strong>{typeLabels[job.type]}</strong>
                  <p>
                    {job.storageKey ?? job.errorMessage ?? 'Preparing file'}
                  </p>
                </div>
                <time dateTime={job.createdAt}>
                  {formatDate(job.createdAt)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <div className="export-empty">
            <span>CSV</span>
            <div>
              <strong>No exports yet</strong>
              <p>Your first completed download will appear here.</p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function ExportCard({
  number,
  title,
  description,
  onClick,
  busy,
}: {
  number: string;
  title: string;
  description: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <article className="export-card">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <button type="button" onClick={onClick} disabled={busy}>
        {busy ? 'Preparing…' : 'Download CSV'}
      </button>
    </article>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
