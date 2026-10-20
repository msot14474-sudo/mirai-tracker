import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { academicApi, dateOnly, GeneratedCalendar } from './academic';
type Exam = GeneratedCalendar['exams'][number];
const shift = (day: string, days: number) =>
  new Date(Date.parse(day) + days * 86400000).toISOString().slice(0, 10);
export function ExamCalendarEditor({
  calendar,
  onSaved,
}: {
  calendar: GeneratedCalendar;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  return (
    <section className="setup-card compact">
      <h3>Exam windows</h3>
      <label>
        Exam to edit
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Add a new exam</option>
          {calendar.exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {dateOnly(e.startDate)}
            </option>
          ))}
        </select>
      </label>
      <ExamForm
        key={`${calendar.semester.id}:${selected}`}
        exam={calendar.exams.find((e) => e.id === selected)}
        calendar={calendar}
        onSaved={onSaved}
      />
    </section>
  );
}
function ExamForm({
  exam,
  calendar,
  onSaved,
}: {
  exam?: Exam;
  calendar: GeneratedCalendar;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(exam?.name ?? '');
  const [type, setType] = useState(exam?.type ?? 'MID_TERM');
  const [start, setStart] = useState(exam ? dateOnly(exam.startDate) : '');
  const [end, setEnd] = useState(exam ? dateOnly(exam.endDate) : '');
  const [deadline, setDeadline] = useState(
    exam ? dateOnly(exam.syllabusDeadline) : '',
  );
  const save = useMutation({
    mutationFn: () => {
      const input = {
        name,
        type: type as 'SESSIONAL' | 'MID_TERM' | 'PUT' | 'END_TERM' | 'OTHER',
        startDate: start,
        endDate: end,
        syllabusDeadline: deadline,
      };
      return exam
        ? academicApi.updateExamWindow(exam.id, input)
        : academicApi.createExamWindow(calendar.semester.id, input);
    },
    onSuccess: onSaved,
  });
  return (
    <form
      className="exam-editor-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <fieldset disabled={save.isPending}>
        <label>
          Exam name
          <input
            value={name}
            required
            onChange={(e) => {
              setName(e.target.value);
              save.reset();
            }}
          />
        </label>
        <label>
          Exam type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              save.reset();
            }}
          >
            {[
              ['SESSIONAL', 'Sessional'],
              ['MID_TERM', 'Mid-term'],
              ['PUT', 'PUT'],
              ['END_TERM', 'End-term'],
              ['OTHER', 'Other'],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="field-pair">
          <label>
            Exam starts
            <input
              type="date"
              required
              value={start}
              min={dateOnly(calendar.semester.startDate)}
              max={dateOnly(calendar.semester.endDate)}
              onChange={(e) => {
                const next = e.target.value;
                if (next && start && end) {
                  const days =
                    (Date.parse(next) - Date.parse(start)) / 86400000;
                  setEnd(shift(end, days));
                  if (deadline) setDeadline(shift(deadline, days));
                } else if (next) {
                  setEnd(next);
                  setDeadline(next);
                }
                setStart(next);
                save.reset();
              }}
            />
          </label>
          <label>
            Exam ends
            <input
              type="date"
              required
              value={end}
              min={start || dateOnly(calendar.semester.startDate)}
              max={dateOnly(calendar.semester.endDate)}
              onChange={(e) => {
                setEnd(e.target.value);
                save.reset();
              }}
            />
          </label>
        </div>
        <label>
          Syllabus deadline
          <input
            type="date"
            required
            value={deadline}
            min={dateOnly(calendar.semester.startDate)}
            max={start || dateOnly(calendar.semester.endDate)}
            onChange={(e) => {
              setDeadline(e.target.value);
              save.reset();
            }}
          />
        </label>
        <p className="academic-meta">
          Changing the start date shifts the end date and syllabus deadline by
          the same number of days. You can adjust each date before saving.
        </p>
        {save.error && (
          <p role="alert" className="form-error">
            {save.error.message}
          </p>
        )}
        {save.isSuccess && (
          <p role="status" className="form-success">
            Exam window saved. Calendar and teaching dates have been refreshed.
          </p>
        )}
        <button className="primary-button" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : exam ? 'Save exam changes' : 'Add exam'}
        </button>
      </fieldset>
    </form>
  );
}
