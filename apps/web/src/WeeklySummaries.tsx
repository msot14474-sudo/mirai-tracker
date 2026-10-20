import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notificationRequest, WeeklySummary } from './notifications';
import { LoadingSkeleton } from './LoadingSkeleton';
export function WeeklySummaries({
  campusId,
  compact = false,
}: {
  campusId?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const query = useQuery({
    queryKey: ['weekly-summaries', campusId],
    queryFn: () =>
      notificationRequest<{ summaries: WeeklySummary[]; schedule: string }>(
        `/weekly-summaries${campusId ? `?campusId=${campusId}` : ''}`,
      ),
    enabled: open,
    refetchInterval: 60000,
  });
  const content = (
    <>
      <p className="notification-subtitle">
        Your weekly teaching review, automatically prepared on Monday morning in
        your campus timezone. The same summary is emailed to your notification
        address.
      </p>
      {query.isPending ? (
        <LoadingSkeleton variant="list" />
      ) : query.error ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <button
            className="secondary-button"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : !query.data?.summaries?.length ? (
        <div className="notification-empty">
          <h3>Your first weekly summary will appear here</h3>
          <p>
            Faculty summaries cover assigned subjects. Campus managers receive
            their campus overview, and administrators receive a summary for each
            campus.
          </p>
        </div>
      ) : (
        query.data.summaries.map((s) => (
          <details className="weekly-summary-card" key={s.id}>
            <summary>
              <span>
                <strong>{s.title}</strong>
                <small>
                  {s.mode === 'demo'
                    ? 'Demo calculated summary'
                    : s.mode === 'ai'
                      ? 'AI summary'
                      : 'Calculated summary · AI unavailable'}{' '}
                  ·{' '}
                  {s.emailStatus === 'NOT_SENT'
                    ? 'Preview · not emailed'
                    : s.emailStatus === 'SENT'
                      ? 'Email sent'
                      : s.emailStatus === 'FAILED'
                        ? 'Email delivery needs attention'
                        : s.emailStatus === 'UNKNOWN'
                          ? 'Check email delivery status'
                          : 'Email pending'}
                </small>
              </span>
            </summary>
            <div className="ai-markdown">
              <Markdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                disallowedElements={['img']}
              >
                {s.text}
              </Markdown>
            </div>
          </details>
        ))
      )}
    </>
  );
  return compact ? (
    <>
      <button
        type="button"
        className="weekly-summary-trigger"
        onClick={() => setOpen(true)}
      >
        Weekly summaries
      </button>
      {open && (
        <div
          className="weekly-summary-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Weekly summaries"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <div className="weekly-summary-dialog">
            <header>
              <h2>Weekly summaries</h2>
              <button
                autoFocus
                type="button"
                aria-label="Close weekly summaries"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>
            <div className="weekly-summary-content">{content}</div>
          </div>
        </div>
      )}
    </>
  ) : (
    <section aria-label="Weekly summaries">{content}</section>
  );
}
