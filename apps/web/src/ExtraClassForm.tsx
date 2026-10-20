import { useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { OfferingTimetable, timetableApi } from './timetable';

export function ExtraClassForm({
  detail,
  onChanged,
}: {
  detail: OfferingTimetable;
  onChanged: () => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [facultyAssignmentId, setFacultyAssignmentId] = useState('');
  const [reason, setReason] = useState('');
  const [savedDate, setSavedDate] = useState('');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: detail.semester.campus.timezone,
  }).format(new Date());
  const minDate =
    today > detail.semester.startDate ? today : detail.semester.startDate;
  const expired = minDate > detail.semester.endDate;
  const teachers = detail.facultyAssignments.filter(
    (f) =>
      f.active &&
      (!date || (f.startDate <= date && (!f.endDate || f.endDate >= date))),
  );
  const mutation = useMutation({
    mutationFn: () =>
      timetableApi.addExtraClass(detail.id, {
        date,
        startTime,
        endTime,
        facultyAssignmentId: facultyAssignmentId || null,
        reason,
      }),
    onSuccess: async () => {
      setSavedDate(date);
      setDate('');
      setReason('');
      await onChanged();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!date || endTime <= startTime || expired || mutation.isPending) return;
    mutation.mutate();
  }
  return (
    <form
      className="setup-card timetable-form extra-class-form"
      onSubmit={submit}
      aria-label="Add an extra class"
    >
      <div>
        <h3>Add an extra class</h3>
        <p className="schedule-help">
          Schedule one additional lecture for {detail.subject.name}. Its hours
          are added to the lesson-plan schedule; the weekly timetable stays the
          same.
        </p>
      </div>
      <label>
        Class date
        <input
          type="date"
          required
          min={minDate}
          max={detail.semester.endDate}
          value={date}
          disabled={mutation.isPending || expired}
          onChange={(e) => {
            setDate(e.target.value);
            setFacultyAssignmentId('');
            mutation.reset();
          }}
        />
      </label>
      <div className="field-pair">
        <label>
          Extra class start time
          <input
            type="time"
            required
            value={startTime}
            disabled={mutation.isPending}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label>
          Extra class end time
          <input
            type="time"
            required
            value={endTime}
            disabled={mutation.isPending}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
      </div>
      {endTime <= startTime && (
        <p className="form-error" role="alert">
          End time must be after start time.
        </p>
      )}
      <label>
        Teacher (optional)
        <select
          value={facultyAssignmentId}
          disabled={mutation.isPending}
          onChange={(e) => setFacultyAssignmentId(e.target.value)}
        >
          <option value="">Use subject assignment</option>
          {teachers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.staff.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reason (optional)
        <input
          maxLength={1000}
          value={reason}
          disabled={mutation.isPending}
          placeholder="For example, revision before an exam"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <p className="schedule-help">
        Times use {detail.semester.campus.timezone}. Choose an open teaching
        day. The batch and teacher must be free.
      </p>
      {expired && (
        <p className="form-error" role="alert">
          This semester has ended. Select a current or upcoming semester to add
          an extra class.
        </p>
      )}
      {mutation.error && (
        <p className="form-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="form-success" role="status">
          Extra class added for {savedDate}. It is listed under Review class
          dates.
        </p>
      )}
      {mutation.data?.warnings.map((w) => (
        <p className="form-error" role="alert" key={w}>
          {w}
        </p>
      ))}
      <button
        className="primary-button"
        disabled={
          !date || expired || mutation.isPending || endTime <= startTime
        }
      >
        {mutation.isPending ? 'Adding class…' : 'Add extra class'}
      </button>
    </form>
  );
}
