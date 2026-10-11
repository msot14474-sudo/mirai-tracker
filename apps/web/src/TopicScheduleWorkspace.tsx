import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { formatTeachingTime } from './lessonPlans';
import { LoadingSkeleton } from './LoadingSkeleton';
import { TopicScheduleDetail, topicScheduleApi } from './topicSchedules';

export function TopicScheduleWorkspace() {
  const [offeringId, setOfferingId] = useState('');
  const offerings = useQuery({
    queryKey: ['topic-schedules', 'offerings'],
    queryFn: topicScheduleApi.offerings,
  });
  const detail = useQuery({
    queryKey: ['topic-schedules', 'offering', offeringId],
    queryFn: () => topicScheduleApi.offering(offeringId),
    enabled: Boolean(offeringId),
  });
  useEffect(() => {
    if (!offeringId && offerings.data?.[0]) setOfferingId(offerings.data[0].id);
  }, [offeringId, offerings.data]);

  return (
    <section
      className="topic-schedule-workspace"
      aria-labelledby="topic-schedule-title"
    >
      <div className="workspace-heading schedule-heading">
        <div>
          <h2 id="topic-schedule-title">Planned topic dates</h2>
        </div>
        <div className="engine-rule">
          <strong>Calculation rule</strong>
          <span>Ordered topic minutes ÷ usable scheduled minutes</span>
        </div>
      </div>

      {offerings.isError ? (
        <p className="form-error" role="alert">
          {offerings.error.message}
        </p>
      ) : null}

      <div
        className="schedule-offering-strip"
        aria-label="Planned-date offerings"
      >
        {offerings.data?.map((offering) => (
          <button
            key={offering.id}
            className={offering.id === offeringId ? 'selected' : ''}
            onClick={() => setOfferingId(offering.id)}
          >
            <strong>{offering.subject.name}</strong>
            <span>
              {offering.batch.name} · {offering.batch.semester.campus.name}
            </span>
            <small>
              {offering.latestSchedule
                ? `Saved v${offering.latestSchedule.version}`
                : 'Live preview only'}
            </small>
          </button>
        ))}
      </div>

      {!offeringId ? (
        <div className="empty-state compact-empty">
          <span>01</span>
          <h3>Select a subject offering</h3>
          <p>Its planned dates and usable class capacity will appear here.</p>
        </div>
      ) : detail.isLoading ? (
        <LoadingSkeleton variant="table" label="Calculating live dates" />
      ) : detail.isError ? (
        <p className="form-error" role="alert">
          {detail.error.message}
        </p>
      ) : detail.data ? (
        <ScheduleDetail detail={detail.data} />
      ) : null}
    </section>
  );
}

function ScheduleDetail({ detail }: { detail: TopicScheduleDetail }) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['topic-schedules', 'offering', detail.id],
    });
    await queryClient.invalidateQueries({
      queryKey: ['topic-schedules', 'offerings'],
    });
  };
  const calculate = useMutation({
    mutationFn: () => topicScheduleApi.calculate(detail.id),
    onSuccess: refresh,
  });
  const summary = detail.preview.summary;

  if (!detail.plan) {
    return (
      <div className="empty-state compact-empty">
        <span>02</span>
        <h3>Lesson plan required</h3>
        <p>Import an M07 lesson plan before calculating topic dates.</p>
      </div>
    );
  }

  return (
    <div className="schedule-detail">
      <div className="schedule-version-bar">
        <div>
          <span className="status-pill active">
            {detail.latestVersion
              ? `SAVED v${detail.latestVersion.version}`
              : 'LIVE PREVIEW'}
          </span>
          <small>
            {detail.latestVersion
              ? reasonLabel(detail.latestVersion.reason)
              : `Lesson plan v${detail.plan.version} · ${detail.plan.status}`}
          </small>
        </div>
        <button
          onClick={() => calculate.mutate()}
          disabled={calculate.isPending}
        >
          {calculate.isPending
            ? 'Calculating…'
            : detail.latestVersion
              ? 'Recalculate dates'
              : 'Save calculated dates'}
        </button>
      </div>
      {calculate.error ? (
        <p className="form-error" role="alert">
          {calculate.error.message}
        </p>
      ) : null}

      <div className="schedule-metrics">
        <Metric
          label="Syllabus time"
          value={formatTeachingTime(summary.requiredMinutes)}
        />
        <Metric
          label="Usable class time"
          value={formatTeachingTime(summary.availableMinutes)}
        />
        <Metric
          label="Allocated"
          value={formatTeachingTime(summary.allocatedMinutes)}
        />
        <Metric
          label="Shortfall"
          value={formatTeachingTime(summary.shortfallMinutes)}
          danger={summary.shortfallMinutes > 0}
        />
      </div>

      <div className="schedule-context">
        <span>{summary.usableSessions} usable classes</span>
        <span>{summary.excludedSessions} excluded classes</span>
        <span>Target finish {displayDate(detail.targetFinishDate)}</span>
      </div>

      <div className="schedule-columns">
        <section
          className="topic-timeline"
          aria-labelledby="topic-timeline-title"
        >
          <div className="subheading-row">
            <div>
              <h3 id="topic-timeline-title">Topic timeline</h3>
            </div>
            <span>
              {detail.preview.allocations.length}/{detail.plan.topics} placed
            </span>
          </div>
          <div className="timeline-header" aria-hidden="true">
            <span>Topic</span>
            <span>Time</span>
            <span>Start</span>
            <span>Finish</span>
          </div>
          {detail.preview.allocations.map((topic) => (
            <article className="timeline-row" key={topic.id}>
              <div>
                <small>
                  U{topic.unitSequence}.{topic.topicSequence} ·{' '}
                  {topic.unitTitle}
                </small>
                <strong>{topic.title}</strong>
              </div>
              <span>{formatTeachingTime(topic.requiredMinutes)}</span>
              <time dateTime={topic.plannedStartDate}>
                {displayDate(topic.plannedStartDate)}
              </time>
              <time
                dateTime={topic.plannedFinishDate}
                className={topic.afterTarget ? 'late-date' : ''}
              >
                {displayDate(topic.plannedFinishDate)}
                {topic.afterTarget ? <small>After target</small> : null}
              </time>
            </article>
          ))}
          {detail.preview.unscheduledTopics.map((topic) => (
            <article className="timeline-row unscheduled" key={topic.id}>
              <div>
                <small>
                  U{topic.unitSequence}.{topic.topicSequence} ·{' '}
                  {topic.unitTitle}
                </small>
                <strong>{topic.title}</strong>
              </div>
              <span>{formatTeachingTime(topic.requiredMinutes)}</span>
              <span>Not placed</span>
              <span>{formatTeachingTime(topic.remainingMinutes)} short</span>
            </article>
          ))}
          {detail.preview.allocations.length === 0 &&
          detail.preview.unscheduledTopics.length === 0 ? (
            <p className="empty-copy">No topics are available to schedule.</p>
          ) : null}
        </section>

        <section
          className="session-capacity"
          aria-labelledby="session-capacity-title"
        >
          <div className="subheading-row">
            <div>
              <h3 id="session-capacity-title">Scheduled classes</h3>
            </div>
            <span>{detail.sessions.length}</span>
          </div>
          <p className="session-help">
            Cancel an unlogged class to create a new shifted schedule version.
          </p>
          <div className="capacity-list">
            {detail.sessions.map((session) => (
              <SessionCapacityRow
                key={session.id}
                session={session}
                onChanged={refresh}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={danger ? 'danger' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SessionCapacityRow({
  session,
  onChanged,
}: {
  session: TopicScheduleDetail['sessions'][number];
  onChanged: () => Promise<void>;
}) {
  const [reason, setReason] = useState(session.cancellationReason ?? '');
  const cancelled = session.status === 'CANCELLED';
  const mutation = useMutation({
    mutationFn: () =>
      topicScheduleApi.setCancellation(
        session.id,
        !cancelled,
        cancelled ? undefined : reason,
      ),
    onSuccess: onChanged,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form
      className={`capacity-row ${cancelled ? 'cancelled' : ''}`}
      onSubmit={submit}
    >
      <div>
        <strong>{displayDate(session.sessionDate)}</strong>
        <span>
          {formatClock(session.startsAt)}–{formatClock(session.endsAt)} ·{' '}
          {formatTeachingTime(session.plannedMinutes)}
        </span>
      </div>
      <span className={`session-state ${session.status.toLowerCase()}`}>
        {session.status}
      </span>
      {cancelled ? (
        <small>{session.cancellationReason}</small>
      ) : (
        <input
          aria-label={`Cancellation reason for ${session.sessionDate}`}
          placeholder="Cancellation reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={session.hasLogs}
          required
        />
      )}
      <button
        className="text-button"
        type="submit"
        disabled={session.hasLogs || mutation.isPending}
      >
        {mutation.isPending
          ? 'Updating…'
          : cancelled
            ? 'Restore'
            : 'Cancel class'}
      </button>
      {session.hasLogs ? <small>Protected: class log exists</small> : null}
      {mutation.error ? (
        <p className="form-error">{mutation.error.message}</p>
      ) : null}
    </form>
  );
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function reasonLabel(value: string) {
  return value.toLowerCase().replaceAll('_', ' ');
}
