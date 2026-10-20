import { useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { OfferingTimetable, timetableApi } from './timetable';

export function TimetableSessionEditor({
  session,
  detail,
  onChanged,
  onClose,
}: {
  session: OfferingTimetable['sessions'][number];
  detail: OfferingTimetable;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const time = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: detail.semester.campus.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  const [date, setDate] = useState(session.sessionDate);
  const [startTime, setStartTime] = useState(time(session.startsAt));
  const [endTime, setEndTime] = useState(time(session.endsAt));
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      timetableApi.moveSession(session.id, {
        date,
        startTime,
        endTime,
        reason,
      }),
    onSuccess: async () => {
      await onChanged();
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }
  return (
    <form
      className="single-class-editor setup-card"
      onSubmit={submit}
      aria-label="Change one class"
    >
      <div className="subheading-row">
        <h4>Change only this class</h4>
        <button
          type="button"
          className="text-button"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Cancel
        </button>
      </div>
      <p className="schedule-help">
        Move this lecture or change its hours. Other weekly classes stay as
        scheduled. Topic dates adjust to the new teaching time.
      </p>
      <div className="form-grid">
        <label>
          Class date
          <input
            type="date"
            autoFocus
            required
            value={date}
            min={detail.semester.startDate}
            max={detail.semester.endDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Reason for change
          <input
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example, a replacement lecture"
          />
        </label>
        <label>
          New start time
          <input
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label>
          New end time
          <input
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
      </div>
      {mutation.error && (
        <p className="form-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      <button
        className="primary-button"
        disabled={mutation.isPending || !reason.trim() || endTime <= startTime}
      >
        {mutation.isPending ? 'Updating class…' : 'Save this class only'}
      </button>
    </form>
  );
}
