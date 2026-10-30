import './MobileWorkflows.css';
import { OfferingListItem, TimetableEntry } from './timetable';

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function BatchTimetableGrid({
  offerings,
  onEdit,
}: {
  offerings: OfferingListItem[];
  onEdit: (offeringId: string, entry: TimetableEntry) => void;
}) {
  const entries = offerings.flatMap((offering, color) =>
    offering.entries
      .filter((entry) => entry.active)
      .map((entry) => ({ offering, entry, color: color % 5 })),
  );
  const times = [
    ...new Set(
      entries.map(({ entry }) => `${entry.startTime}–${entry.endTime}`),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const shownDays = days.slice(
    0,
    entries.some(({ entry }) => entry.weekday === 7) ? 7 : 6,
  );
  return (
    <div
      className="batch-week-grid table-scroll"
      role="region"
      aria-label="Full batch weekly timetable"
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">
          Weekly classes for every subject in the selected batch. Select a class
          to edit its repeating schedule.
        </caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {shownDays.map((day) => (
              <th scope="col" key={day}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.length ? (
            times.map((time) => (
              <tr key={time}>
                <th scope="row">{time}</th>
                {shownDays.map((day, i) => (
                  <td
                    key={day}
                    data-day={day}
                    className={
                      entries.some(
                        ({ entry }) =>
                          entry.weekday === i + 1 &&
                          `${entry.startTime}–${entry.endTime}` === time,
                      )
                        ? 'has-class'
                        : 'empty-day'
                    }
                  >
                    {entries
                      .filter(
                        ({ entry }) =>
                          entry.weekday === i + 1 &&
                          `${entry.startTime}–${entry.endTime}` === time,
                      )
                      .map(({ entry, offering, color }) => (
                        <button
                          type="button"
                          className={`batch-week-class tone-${color}`}
                          key={entry.id}
                          onClick={() => onEdit(offering.id, entry)}
                          title={`Repeats ${entry.effectiveFrom} – ${entry.effectiveTo || offering.targetFinishDate}`}
                          aria-label={`Edit ${offering.subject.name}, ${day} ${time}`}
                        >
                          <strong>{offering.subject.name}</strong>
                          <span>{offering.subject.code}</span>
                          <small>
                            {entry.facultyName || 'Teacher not assigned'}
                          </small>
                        </button>
                      ))}
                    {!entries.some(
                      ({ entry }) =>
                        entry.weekday === i + 1 &&
                        `${entry.startTime}–${entry.endTime}` === time,
                    ) && (
                      <span className="batch-free-slot" aria-label="No class">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={shownDays.length + 1}>
                <div className="batch-grid-empty">
                  <strong>Your batch timetable starts here</strong>
                  <p>
                    Upload the weekly timetable or add a class below. All
                    subjects will appear together in this grid.
                  </p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
