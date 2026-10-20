import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityItem, notificationRequest } from './notifications';
import { WeeklySummaries } from './WeeklySummaries';
import { AlertCenter } from './AlertCenter';
import { LoadingSkeleton } from './LoadingSkeleton';
export function NotificationCenter({
  campusId,
  canViewMissedLogs,
  onOpen,
}: {
  campusId?: string;
  canViewMissedLogs: boolean;
  onOpen: (view: string, campusId?: string) => void;
}) {
  const [tab, setTab] = useState('activity'),
    [unread, setUnread] = useState(false),
    [before, setBefore] = useState('');
  const client = useQueryClient();
  const feed = useQuery({
    queryKey: ['notifications', campusId, before],
    queryFn: () =>
      notificationRequest<{ items: ActivityItem[]; nextBefore: string | null }>(
        `?${new URLSearchParams({ ...(campusId ? { campusId } : {}), ...(before ? { before } : {}) })}`,
      ),
    refetchInterval: 30000,
  });
  const read = useMutation({
    mutationFn: (ids: string[]) =>
      notificationRequest('/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const items = Array.isArray(feed.data?.items) ? feed.data.items : [];
  const visible = items.filter((n) => !unread || !n.read);
  return (
    <section className="notification-center">
      <header className="notification-heading">
        <div>
          <p className="eyebrow">CAMPUS ACTIVITY</p>
          <h2>Notifications</h2>
          <p>
            Who changed what, and what it means for your campus and teaching.
          </p>
        </div>
        <span className="notification-count">
          {items.filter((n) => !n.read).length} unread on this page
        </span>
      </header>
      <div
        className="campus-data-tabs"
        role="group"
        aria-label="Notification views"
      >
        <button
          aria-pressed={tab === 'activity'}
          onClick={() => setTab('activity')}
        >
          Updates
        </button>
        <button
          aria-pressed={tab === 'weekly'}
          onClick={() => setTab('weekly')}
        >
          Weekly summaries
        </button>
        {canViewMissedLogs && (
          <button aria-pressed={tab === 'logs'} onClick={() => setTab('logs')}>
            Missed-log alerts
          </button>
        )}
      </div>
      {tab === 'weekly' ? (
        <WeeklySummaries campusId={campusId} />
      ) : tab === 'logs' ? (
        <AlertCenter campusId={campusId} />
      ) : (
        <>
          <div className="notification-toolbar">
            <label>
              <input
                type="checkbox"
                checked={unread}
                onChange={(e) => setUnread(e.target.checked)}
              />{' '}
              Unread only
            </label>
            <button
              className="secondary-button"
              disabled={read.isPending || !items.some((n) => !n.read)}
              onClick={() =>
                read.mutate(items.filter((n) => !n.read).map((n) => n.id))
              }
            >
              Mark this page read
            </button>
          </div>
          {(feed.error || read.error) && (
            <div className="form-error" role="alert">
              {feed.error?.message || read.error?.message}
              <button onClick={() => void feed.refetch()}>Retry</button>
            </div>
          )}
          {feed.isPending ? (
            <LoadingSkeleton variant="list" />
          ) : !visible.length ? (
            <div className="notification-empty">
              <h3>{unread ? 'You’re caught up' : 'No updates yet'}</h3>
              <p>
                New calendar, timetable, subject and team changes relevant to
                your role will appear here.
              </p>
            </div>
          ) : (
            <div className="notification-list">
              {visible.map((n) => (
                <article
                  key={n.id}
                  className={`notification-card ${n.read ? '' : 'unread'}`}
                >
                  <div className="notification-event-icon" aria-hidden="true">
                    {n.category === 'Team & access'
                      ? '👥'
                      : n.category === 'Teaching'
                        ? '✓'
                        : n.category === 'Expenses'
                          ? '₹'
                          : '▦'}
                  </div>
                  <div>
                    <div className="notification-card-meta">
                      <span>{n.category}</span>
                      <time dateTime={n.createdAt}>
                        {new Date(n.createdAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </div>
                    <h3>{n.title}</h3>
                    <p>{n.description}</p>
                    <div className="notification-card-actions">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          if (!n.read) read.mutate([n.id]);
                          onOpen(n.view, n.campusId);
                        }}
                      >
                        View details
                      </button>
                      {!n.read && (
                        <button
                          className="notification-text-button"
                          disabled={read.isPending}
                          onClick={() => read.mutate([n.id])}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="notification-toolbar">
            <button
              className="secondary-button"
              disabled={!before}
              onClick={() => setBefore('')}
            >
              Latest updates
            </button>
            <button
              className="secondary-button"
              disabled={!feed.data?.nextBefore}
              onClick={() => setBefore(feed.data!.nextBefore!)}
            >
              Older updates
            </button>
          </div>
        </>
      )}
    </section>
  );
}
