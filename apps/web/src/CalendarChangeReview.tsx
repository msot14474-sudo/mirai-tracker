import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { TopicScheduleDetail, topicScheduleApi } from './topicSchedules';
import { formatTeachingTime } from './lessonPlans';

export function CalendarChangeReview({
  sessions,
  onChanged,
}: {
  sessions: TopicScheduleDetail['sessions'];
  onChanged: () => Promise<void>;
}) {
  const affected = sessions.filter((s) => s.needsCalendarReview);
  if (!affected.length) return null;
  return (
    <section
      className="calendar-change-review"
      aria-label="Calendar changes to review"
    >
      <div>
        <span className="eyebrow">Teacher review</span>
        <h3>
          {affected.length}{' '}
          {affected.length === 1 ? 'class needs' : 'classes need'} a new plan
        </h3>
        <p>
          The campus calendar changed. These classes are excluded from teaching
          hours until you choose what happens next. Remaining topics already
          follow the available timetable.
        </p>
      </div>
      {affected.map((session) => (
        <ReviewClass key={session.id} session={session} onChanged={onChanged} />
      ))}
    </section>
  );
}
function ReviewClass({
  session,
  onChanged,
}: {
  session: TopicScheduleDetail['sessions'][number];
  onChanged: () => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState(
    'Recover class affected by the campus calendar change.',
  );
  const suggestions = useMutation({
    mutationFn: () => topicScheduleApi.recoveryOptions(session.id),
    onSuccess: (data) => {
      const choice = data.options.find((o) => o.id === data.recommendedId);
      if (choice) {
        setDate(choice.date);
        setStartTime(choice.startTime);
        setEndTime(choice.endTime);
      }
    },
  });
  const move = useMutation({
    mutationFn: () =>
      topicScheduleApi.move(session.id, { date, startTime, endTime, reason }),
    onSuccess: onChanged,
  });
  const keep = useMutation({
    mutationFn: () =>
      topicScheduleApi.setCancellation(
        session.id,
        true,
        'Teacher reviewed calendar change: use remaining scheduled classes.',
      ),
    onSuccess: onChanged,
  });
  const busy = move.isPending || keep.isPending;
  const error = suggestions.error || move.error || keep.error;
  return (
    <article className="recovery-class">
      <div className="subheading-row">
        <strong>
          {new Date(session.sessionDate + 'T12:00:00').toLocaleDateString(
            'en-GB',
            { day: 'numeric', month: 'short', year: 'numeric' },
          )}
        </strong>
        <span>{formatTeachingTime(session.plannedMinutes)} to review</span>
      </div>
      <div className="action-row">
        <button
          className="secondary-button"
          disabled={busy || suggestions.isPending}
          onClick={() => suggestions.mutate()}
        >
          {suggestions.isPending
            ? 'Checking available times…'
            : 'Suggest a replacement'}
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setManual(!manual)}
        >
          Choose a time
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => keep.mutate()}
        >
          {keep.isPending ? 'Saving…' : 'Use remaining classes'}
        </button>
      </div>
      {suggestions.data && (
        <div className="recovery-options">
          <p>
            <strong>
              {suggestions.data.source === 'ai'
                ? 'AI recommendation'
                : 'Calendar recommendation'}
            </strong>{' '}
            · {suggestions.data.explanation}
          </p>
          {suggestions.data.options.length > 0 && (
            <label>
              Replacement class ({suggestions.data.timezone})
              <select
                value={date + ' ' + startTime}
                onChange={(e) => {
                  const choice = suggestions.data!.options.find(
                    (o) => o.date + ' ' + o.startTime === e.target.value,
                  );
                  if (choice) {
                    setDate(choice.date);
                    setStartTime(choice.startTime);
                    setEndTime(choice.endTime);
                  }
                }}
              >
                <option value="">Choose a replacement</option>
                {suggestions.data.options.map((o) => (
                  <option key={o.id} value={o.date + ' ' + o.startTime}>
                    {o.date} · {o.startTime}–{o.endTime}
                    {o.afterTarget ? ' · after syllabus target' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {manual && (
        <div className="recovery-manual">
          <label>
            Date
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
        </div>
      )}
      {(manual || !!suggestions.data?.options.length) && (
        <>
          <label>
            Teaching note
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
            />
          </label>
          <button
            className="primary-button"
            disabled={busy || !date || !startTime || !endTime || !reason.trim()}
            onClick={() => move.mutate()}
          >
            {move.isPending ? 'Moving class…' : 'Confirm and move class'}
          </button>
          <small>
            Working days, assignment dates and timetable clashes are checked
            again when you confirm.
          </small>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
    </article>
  );
}
