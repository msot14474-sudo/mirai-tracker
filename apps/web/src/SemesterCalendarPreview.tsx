import { useState } from 'react';
import { GeneratedCalendar } from './academic';

export function SemesterCalendarPreview({
  calendar,
}: {
  calendar: GeneratedCalendar;
}) {
  const months = [...new Set(calendar.days.map((day) => day.date.slice(0, 7)))];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(
    months.includes(currentMonth) ? currentMonth : (months[0] ?? ''),
  );
  const month = months.includes(selectedMonth)
    ? selectedMonth
    : (months[0] ?? '');
  const index = months.indexOf(month);
  const days = calendar.days.filter((day) => day.date.startsWith(month));
  const teachingDays = days.filter((day) => day.working).length;
  const closedDays = days.length - teachingDays;
  const monthName = (value: string) =>
    new Intl.DateTimeFormat('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}-01T00:00:00Z`));

  if (!months.length)
    return <p className="empty-copy">No calendar dates are available.</p>;

  return (
    <div className="semester-month-view">
      <div className="semester-month-controls">
        <button
          type="button"
          className="secondary-button"
          aria-label="Previous month"
          disabled={index === 0}
          onClick={() => setSelectedMonth(months[index - 1]!)}
        >
          ←
        </button>
        <label>
          Calendar month
          <select
            value={month}
            onChange={(event) => setSelectedMonth(event.target.value)}
          >
            {months.map((value) => (
              <option key={value} value={value}>
                {monthName(value)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          aria-label="Next month"
          disabled={index === months.length - 1}
          onClick={() => setSelectedMonth(months[index + 1]!)}
        >
          →
        </button>
      </div>
      <p className="semester-month-count" role="status">
        {teachingDays} teaching {teachingDays === 1 ? 'day' : 'days'} ·{' '}
        {closedDays} non-teaching {closedDays === 1 ? 'day' : 'days'}
      </p>
      <div
        className="schedule-date-list"
        tabIndex={0}
        role="region"
        aria-label="All semester dates"
      >
        {days.map((day) => (
          <div className="calendar-row" key={day.date}>
            <time dateTime={day.date}>
              {new Intl.DateTimeFormat('en-IN', {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              }).format(new Date(`${day.date}T00:00:00Z`))}
              <small className="calendar-weekday">
                {day.weekday.toLowerCase()}
              </small>
            </time>
            <span>
              {day.override?.title ??
                day.reason.toLowerCase().replaceAll('_', ' ')}
            </span>
            <b className={day.working ? 'working' : 'closed'}>
              {day.working ? 'Teaching' : 'Closed'}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}
