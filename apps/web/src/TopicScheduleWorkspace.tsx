import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { formatTeachingTime } from './lessonPlans';
import { LoadingSkeleton } from './LoadingSkeleton';
import { TopicScheduleDetail, topicScheduleApi } from './topicSchedules';

export function TopicScheduleWorkspace({ campusId }: { campusId?: string }) {
  const queryClient = useQueryClient();
  const [offeringId, setOfferingId] = useState('');
  const offerings = useQuery({
    queryKey: ['topic-schedules', 'offerings', campusId],
    queryFn: () => topicScheduleApi.offerings(campusId),
    staleTime: 60_000,
  });
  const selectedOfferingId = offeringId || offerings.data?.[0]?.id || '';
  const detail = useQuery({
    queryKey: ['topic-schedules', 'offering', selectedOfferingId],
    queryFn: () => topicScheduleApi.offering(selectedOfferingId),
    enabled: Boolean(selectedOfferingId),
    staleTime: 60_000,
  });
  const selectionIsLoading = offerings.isLoading;

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
        {selectionIsLoading ? (
          <LoadingSkeleton
            variant="cards"
            count={3}
            label="Loading planned-date offerings"
          />
        ) : (
          offerings.data?.map((offering) => (
            <button
              key={offering.id}
              className={offering.id === selectedOfferingId ? 'selected' : ''}
              onMouseEnter={() =>
                void queryClient.prefetchQuery({
                  queryKey: ['topic-schedules', 'offering', offering.id],
                  queryFn: () => topicScheduleApi.offering(offering.id),
                  staleTime: 60_000,
                })
              }
              onFocus={() =>
                void queryClient.prefetchQuery({
                  queryKey: ['topic-schedules', 'offering', offering.id],
                  queryFn: () => topicScheduleApi.offering(offering.id),
                  staleTime: 60_000,
                })
              }
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
          ))
        )}
      </div>

      {selectionIsLoading ? (
        <LoadingSkeleton variant="table" label="Loading planned dates" />
      ) : offerings.isError && !offerings.data ? null : !selectedOfferingId ? (
        <div className="empty-state compact-empty">
          <span>01</span>
          <h3>No subject offerings</h3>
          <p>No offering is available for planned-date calculation.</p>
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
    await Promise.all(
      [
        'timetable',
        'session-logs',
        'topic-schedules',
        'progress-dashboard',
        'exam-readiness',
        'student-overview',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
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
        <p>
          Your timetable is ready below. Upload your units, topics and planned
          hours in Lesson plans to allocate the teaching time.
        </p>
        {detail.sessions.map((session) => (
          <SessionCapacityRow
            key={session.id}
            session={session}
            onChanged={refresh}
          />
        ))}
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

      {detail.baseline && (
        <details className="panel">
          <summary>
            Original saved plan · version {detail.baseline.version}
          </summary>
          {detail.baseline.entries.map((entry) => (
            <p key={entry.topicId}>
              {detail.coverage?.find((t) => t.id === entry.topicId)?.title ||
                'Topic'}{' '}
              · {displayDate(entry.plannedStartDate)} –{' '}
              {displayDate(entry.plannedFinishDate)}
            </p>
          ))}
        </details>
      )}
      {detail.forecast && (
        <section className="panel" aria-label="Remaining teaching forecast">
          <h3>What needs to be covered next</h3>
          <p>
            Unfinished topic hours are placed into upcoming unlogged classes.
            The planned timeline below remains available for comparison.
          </p>
          <div className="schedule-metrics">
            <Metric
              label="Remaining work"
              value={formatTeachingTime(
                detail.forecast.summary.requiredMinutes,
              )}
            />
            <Metric
              label="Future class time"
              value={formatTeachingTime(
                detail.forecast.summary.availableMinutes,
              )}
            />
            <Metric
              label="Unallocated work"
              value={formatTeachingTime(
                detail.forecast.summary.shortfallMinutes,
              )}
              danger={detail.forecast.summary.shortfallMinutes > 0}
            />
          </div>
          {detail.forecast.allocations.map((topic) => (
            <div className="timeline-row" key={topic.id}>
              <strong>{topic.title}</strong>
              <span>{formatTeachingTime(topic.requiredMinutes)}</span>
              <span>{displayDate(topic.plannedStartDate)}</span>
              <span>
                {displayDate(topic.plannedFinishDate)}
                {topic.afterTarget ? ' · After deadline' : ''}
              </span>
            </div>
          ))}
          {detail.forecast.unscheduledTopics.map((topic) => (
            <p className="form-error" key={topic.id}>
              {topic.title}: {formatTeachingTime(topic.remainingMinutes)} needs
              additional teaching time.
            </p>
          ))}
          {detail.forecast.summary.requiredMinutes === 0 && (
            <p>All in-scope topics are covered.</p>
          )}
          <details>
            <summary>Topic completion</summary>
            {detail.coverage?.map((topic) => (
              <p key={topic.id}>
                {topic.title} · {topic.completionPercentage}% ·{' '}
                {topic.status.replaceAll('_', ' ')}
              </p>
            ))}
          </details>
        </section>
      )}

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
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const move = useMutation({
    mutationFn: () =>
      topicScheduleApi.move(session.id, { date, startTime, endTime, reason }),
    onSuccess: async () => {
      setMoving(false);
      await onChanged();
    },
  });
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
        <small className="cancellation-note">
          {session.cancellationReason}
        </small>
      ) : (
        <input
          aria-label={`Cancellation reason for ${session.sessionDate}`}
          placeholder="Reason for cancelling or moving"
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
      {!session.hasLogs && session.status === 'SCHEDULED' && (
        <>
          <button
            type="button"
            className="text-button"
            onClick={() => setMoving(!moving)}
          >
            Move class
          </button>
          {moving && (
            <div className="lecture-move-fields">
              <label>
                New date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Starts (campus time)
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <label>
                Ends (campus time)
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
              <p>
                Enter the reason above. Holidays, non-working Saturdays and
                timetable clashes are checked before saving.
              </p>
              <button
                type="button"
                disabled={
                  move.isPending ||
                  !date ||
                  !startTime ||
                  !endTime ||
                  !reason.trim()
                }
                onClick={() => move.mutate()}
              >
                {move.isPending ? 'Moving…' : 'Save new class time'}
              </button>
            </div>
          )}
          {move.error && (
            <p role="alert" className="form-error">
              {move.error.message}
            </p>
          )}
        </>
      )}
      {session.hasLogs ? (
        <small className="protected-note">Protected: class log exists</small>
      ) : null}
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
