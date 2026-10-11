import { useQuery } from '@tanstack/react-query';
import { alertApi, MissedLogAlert } from './alerts';
import { LoadingSkeleton } from './LoadingSkeleton';

export function AlertCenter() {
  const feed = useQuery({
    queryKey: ['missed-log-alerts'],
    queryFn: alertApi.mine,
    refetchInterval: 60_000,
  });

  return (
    <section
      id="missed-log-alerts"
      className="alert-center"
      aria-labelledby="alert-center-title"
    >
      <div className="alert-center-heading">
        <h2 id="alert-center-title">Missed-log alerts</h2>
      </div>

      {feed.isLoading ? (
        <LoadingSkeleton variant="cards" label="Checking missed class logs" />
      ) : feed.isError ? (
        <p className="form-error" role="alert">
          {feed.error.message}
        </p>
      ) : !feed.data ? (
        <p className="workspace-loading">Alert history is unavailable.</p>
      ) : (
        <>
          <div className="alert-summary" aria-label="Alert summary">
            <Metric label="Your alerts" value={feed.data.summary.total} />
            <Metric
              label="Faculty reminders"
              value={feed.data.summary.facultyReminders}
            />
            <Metric
              label="Manager escalations"
              value={feed.data.summary.managerEscalations}
            />
            <Metric
              label="Delivery failures"
              value={feed.data.summary.failed}
            />
          </div>

          {feed.data.alerts.length ? (
            <div className="alert-list">
              {feed.data.alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          ) : (
            <div className="alert-empty">
              <span>✓</span>
              <div>
                <strong>No missed-log alerts</strong>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AlertCard({ alert }: { alert: MissedLogAlert }) {
  const escalation = alert.type === 'CAMPUS_MANAGER_ESCALATION';
  return (
    <article className={`alert-card ${escalation ? 'escalation' : 'reminder'}`}>
      <div className="alert-card-topline">
        <span>{escalation ? '48-hour escalation' : 'End-of-day reminder'}</span>
        <strong>{statusLabel(alert.status)}</strong>
      </div>
      <div className="alert-card-main">
        <div>
          <p>{alert.subject.code}</p>
          <h3>{alert.subject.name}</h3>
          <span>
            {alert.batch.name} · {alert.campus.name}
          </span>
        </div>
        <time dateTime={alert.session.startsAt}>
          {formatClassTime(alert.session.startsAt, alert.campus.timezone)}
        </time>
      </div>
      <div className="delivery-row" aria-label="Delivery channels">
        {alert.deliveries.map((delivery) => (
          <span key={delivery.channel}>
            {channelLabel(delivery.channel)} · {statusLabel(delivery.status)}
          </span>
        ))}
      </div>
    </article>
  );
}

function formatClassTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function channelLabel(value: MissedLogAlert['deliveries'][number]['channel']) {
  return value === 'IN_APP'
    ? 'In app'
    : value[0] + value.slice(1).toLowerCase();
}

function statusLabel(value: string) {
  return value[0] + value.slice(1).toLowerCase().replace('_', ' ');
}
