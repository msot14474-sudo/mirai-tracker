import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useRef, useState } from 'react';
import { formatTeachingTime } from './lessonPlans';
import { LoadingSkeleton } from './LoadingSkeleton';
import {
  FacultySession,
  SessionLogInput,
  SessionLogStatus,
  sessionLogApi,
  TopicLogInput,
  WorkStatus,
} from './sessionLogs';

const statuses: Array<{ value: SessionLogStatus; label: string }> = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'SKIPPED', label: 'Skipped' },
  { value: 'MERGED', label: 'Merged' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const workStatuses: Array<{ value: WorkStatus; label: string }> = [
  { value: 'NOT_ASSIGNED', label: 'Not assigned' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'PARTIAL', label: 'Partly complete' },
  { value: 'COMPLETED', label: 'Complete' },
  { value: 'NOT_APPLICABLE', label: 'Not applicable' },
];

export function SessionLoggingWorkspace({ campusId }: { campusId?: string }) {
  const [date, setDate] = useState(today());
  const day = useQuery({
    queryKey: ['session-logs', date, campusId],
    queryFn: () => sessionLogApi.forDate(date, campusId),
  });

  return (
    <section
      className="session-log-workspace"
      aria-labelledby="session-log-title"
    >
      <div className="workspace-heading logging-heading">
        <div>
          <p className="step-label">Faculty daily flow</p>
          <h2 id="session-log-title">Log today’s classes</h2>
          <p>
            Your timetable and current topic are already filled in. Confirm the
            suggestion or adjust what actually happened.
          </p>
        </div>
        <label className="logging-date">
          Teaching date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>

      <div className="speed-banner">
        <strong>Under-one-minute flow</strong>
        <span>Open the class · check the prefill · tap confirm</span>
      </div>

      {day.isLoading ? (
        <LoadingSkeleton variant="list" label="Loading your timetable" />
      ) : null}
      {day.isError ? (
        <p className="form-error" role="alert">
          {day.error.message}
        </p>
      ) : null}
      {day.data?.sessions.length === 0 ? (
        <div className="empty-state logging-empty">
          <span>✓</span>
          <h3>No assigned classes on this date</h3>
          <p>Choose another teaching date to view its pre-filled sessions.</p>
        </div>
      ) : null}
      <div className="daily-session-list">
        {day.data?.sessions.map((session) => (
          <SessionLogCard
            key={session.id}
            session={session}
            mergeTargets={(day.data?.mergeTargets ?? []).filter(
              (target) => target.id !== session.id,
            )}
            date={date}
          />
        ))}
      </div>
    </section>
  );
}

function SessionLogCard({
  session,
  mergeTargets,
  date,
}: {
  session: FacultySession;
  mergeTargets: Array<{
    id: string;
    sessionDate: string;
    startsAt: string;
    subject: { code: string; name: string };
    batch: { code: string; name: string };
  }>;
  date: string;
}) {
  const queryClient = useQueryClient();
  const openedAt = useRef(Date.now());
  const [savedSeconds, setSavedSeconds] = useState<number | null>(null);
  const [form, setForm] = useState<SessionLogInput>({
    ...session.prefill,
    topicUpdates: session.prefill.topicUpdates.map((update) => ({ ...update })),
  });
  const noTeaching = ['SKIPPED', 'MERGED', 'CANCELLED'].includes(form.status);
  const mutation = useMutation({
    mutationFn: (input: SessionLogInput) =>
      sessionLogApi.create(session.id, input),
    onSuccess: async (_result, input) => {
      setSavedSeconds(input.clientElapsedSeconds ?? null);
      await Promise.all(
        [
          'timetable',
          'topic-schedules',
          'progress-dashboard',
          'exam-readiness',
          'student-overview',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      await queryClient.invalidateQueries({ queryKey: ['session-logs'] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const elapsed =
      Math.round(((Date.now() - openedAt.current) / 1_000) * 10) / 10;
    mutation.mutate({
      ...form,
      overallCompletionPercentage: noTeaching
        ? 0
        : form.overallCompletionPercentage,
      topicUpdates: noTeaching ? [] : form.topicUpdates,
      carryForwardTopicId: noTeaching ? null : form.carryForwardTopicId,
      mergedIntoSessionId:
        form.status === 'MERGED' ? form.mergedIntoSessionId : null,
      cancellationReason:
        form.status === 'CANCELLED' ? form.cancellationReason : null,
      clientElapsedSeconds: elapsed,
    });
  }

  return (
    <article className="daily-session-card">
      <header>
        <div className="session-time-block">
          <time dateTime={session.startsAt}>{clock(session.startsAt)}</time>
          <span>{formatTeachingTime(session.plannedMinutes)}</span>
        </div>
        <div>
          <p>
            {session.subject.code} · {session.batch.code}
          </p>
          <h3>{session.subject.name}</h3>
          <span>
            {session.batch.name} · {session.campus.name}
          </span>
        </div>
        <div className="log-state">
          {session.latestLog ? (
            <>
              <strong>Logged · revision {session.latestLog.revision}</strong>
              <span>{statusLabel(session.latestLog.status)}</span>
            </>
          ) : (
            <>
              <strong>Ready to confirm</strong>
              <span>Pre-filled</span>
            </>
          )}
        </div>
      </header>

      <form className="mobile-log-form" onSubmit={submit}>
        <div className="log-primary-grid">
          <label>
            Session status
            <select
              aria-label={`${session.subject.name} session status`}
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as SessionLogStatus,
                  coveredSummary: defaultSummary(
                    event.target.value as SessionLogStatus,
                    form.coveredSummary,
                  ),
                })
              }
            >
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session complete
            <div className="percentage-input">
              <input
                aria-label={`${session.subject.name} session completion`}
                type="number"
                min="0"
                max="100"
                step="1"
                value={noTeaching ? 0 : form.overallCompletionPercentage}
                disabled={noTeaching}
                onChange={(event) =>
                  setForm({
                    ...form,
                    overallCompletionPercentage: Number(event.target.value),
                  })
                }
              />
              <span>%</span>
            </div>
          </label>
        </div>

        {!noTeaching ? (
          <div className="topic-progress-editor">
            <div className="subheading-row">
              <div>
                <p className="step-label">Topic progress</p>
                <strong>What moved forward?</strong>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const next = session.topics.find(
                    (topic) =>
                      !form.topicUpdates.some(
                        (update) => update.topicId === topic.id,
                      ),
                  );
                  if (next) {
                    setForm({
                      ...form,
                      topicUpdates: [
                        ...form.topicUpdates,
                        {
                          topicId: next.id,
                          completionAfterPercentage:
                            next.currentCompletionPercentage,
                          minutesUsed: 0,
                          notes: null,
                        },
                      ],
                    });
                  }
                }}
              >
                Add topic
              </button>
            </div>
            {form.topicUpdates.map((update, index) => (
              <TopicProgressRow
                key={`${update.topicId}-${index}`}
                update={update}
                session={session}
                onChange={(changed) =>
                  setForm({
                    ...form,
                    topicUpdates: form.topicUpdates.map(
                      (current, currentIndex) =>
                        currentIndex === index ? changed : current,
                    ),
                  })
                }
                onRemove={() =>
                  setForm({
                    ...form,
                    topicUpdates: form.topicUpdates.filter(
                      (_, currentIndex) => currentIndex !== index,
                    ),
                  })
                }
              />
            ))}
          </div>
        ) : null}

        {form.status === 'MERGED' ? (
          <label>
            Merged into class
            <select
              aria-label={`${session.subject.name} merge target`}
              value={form.mergedIntoSessionId ?? ''}
              onChange={(event) =>
                setForm({
                  ...form,
                  mergedIntoSessionId: event.target.value || null,
                })
              }
              required
            >
              <option value="">Choose a class</option>
              {mergeTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.sessionDate} · {target.subject.code} ·{' '}
                  {target.batch.code}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {form.status === 'CANCELLED' ? (
          <label>
            Cancellation reason
            <input
              aria-label={`${session.subject.name} cancellation reason`}
              value={form.cancellationReason ?? ''}
              onChange={(event) =>
                setForm({ ...form, cancellationReason: event.target.value })
              }
              required
            />
          </label>
        ) : null}

        <label>
          What was covered?
          <textarea
            aria-label={`${session.subject.name} covered summary`}
            value={form.coveredSummary}
            onChange={(event) =>
              setForm({ ...form, coveredSummary: event.target.value })
            }
            required
          />
        </label>

        {!noTeaching ? (
          <div className="carry-forward-grid">
            <label>
              What is left over?
              <input
                value={form.leftOverSummary ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    leftOverSummary: event.target.value || null,
                  })
                }
                placeholder="Nothing left over"
              />
            </label>
            <label>
              Carry forward to
              <select
                value={form.carryForwardTopicId ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    carryForwardTopicId: event.target.value || null,
                  })
                }
              >
                <option value="">No carry-forward</option>
                {session.topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="work-status-grid">
          <WorkSelect
            label="Classwork"
            value={form.classworkStatus}
            onChange={(value) => setForm({ ...form, classworkStatus: value })}
          />
          <WorkSelect
            label="Homework"
            value={form.homeworkStatus}
            onChange={(value) => setForm({ ...form, homeworkStatus: value })}
          />
        </div>

        <details className="log-notes">
          <summary>Add notes</summary>
          <textarea
            aria-label={`${session.subject.name} notes`}
            value={form.notes ?? ''}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value || null })
            }
            placeholder="Optional context for the academic team"
          />
        </details>

        {mutation.error ? (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
        {mutation.isSuccess && savedSeconds !== null ? (
          <p className="log-success" role="status">
            Saved revision in {savedSeconds.toFixed(1)} seconds.
          </p>
        ) : null}
        <button className="confirm-log-button" disabled={mutation.isPending}>
          {mutation.isPending
            ? 'Saving…'
            : session.latestLog
              ? 'Save corrected log'
              : 'Confirm session in one tap'}
        </button>
      </form>
    </article>
  );
}

function TopicProgressRow({
  update,
  session,
  onChange,
  onRemove,
}: {
  update: TopicLogInput;
  session: FacultySession;
  onChange: (update: TopicLogInput) => void;
  onRemove: () => void;
}) {
  const selected = session.topics.find((topic) => topic.id === update.topicId);
  return (
    <div className="topic-progress-row">
      <label>
        Topic
        <select
          value={update.topicId}
          onChange={(event) => {
            const topic = session.topics.find(
              (candidate) => candidate.id === event.target.value,
            );
            onChange({
              ...update,
              topicId: event.target.value,
              completionAfterPercentage:
                topic?.currentCompletionPercentage ?? 0,
            });
          }}
        >
          {session.topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              U{topic.unitSequence}.{topic.sequence} · {topic.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Topic complete
        <div className="percentage-input">
          <input
            aria-label={`${selected?.title ?? 'Topic'} completion after class`}
            type="number"
            min={selected?.currentCompletionPercentage ?? 0}
            max="100"
            step="0.01"
            value={update.completionAfterPercentage}
            onChange={(event) =>
              onChange({
                ...update,
                completionAfterPercentage: Number(event.target.value),
              })
            }
          />
          <span>%</span>
        </div>
      </label>
      <label>
        Minutes used
        <input
          aria-label={`${selected?.title ?? 'Topic'} minutes used`}
          type="number"
          min="0"
          max={session.plannedMinutes}
          value={update.minutesUsed ?? ''}
          onChange={(event) =>
            onChange({
              ...update,
              minutesUsed: event.target.value
                ? Number(event.target.value)
                : null,
            })
          }
        />
      </label>
      <button
        type="button"
        className="icon-button"
        onClick={onRemove}
        aria-label={`Remove ${selected?.title ?? 'topic'}`}
      >
        ×
      </button>
    </div>
  );
}

function WorkSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WorkStatus;
  onChange: (value: WorkStatus) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as WorkStatus)}
      >
        {workStatuses.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function clock(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function statusLabel(value: SessionLogStatus) {
  return statuses.find((status) => status.value === value)?.label ?? value;
}

function defaultSummary(status: SessionLogStatus, current: string) {
  if (status === 'SKIPPED') return 'Session skipped';
  if (status === 'MERGED') return 'Session merged with another class';
  if (status === 'CANCELLED') return 'Session cancelled';
  return current;
}
