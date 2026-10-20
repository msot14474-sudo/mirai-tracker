import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicApi } from './academic';
import { LoadingSkeleton } from './LoadingSkeleton';

const readable = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));

/** Read-only view of the same campus records maintained by the program manager. */
export function CampusAcademicOverview() {
  const [chosenCampus, setCampus] = useState('');
  const [chosenSemester, setSemester] = useState('');
  const refresh = {
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always' as const,
  };
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
    ...refresh,
  });
  const campusId = chosenCampus || campuses.data?.[0]?.id || '';
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId),
    enabled: !!campusId,
    ...refresh,
  });
  const subjects = useQuery({
    queryKey: ['academic', 'subjects', campusId],
    queryFn: () => academicApi.subjects(campusId),
    enabled: !!campusId,
    ...refresh,
  });
  const semesterId =
    semesters.data?.find((s) => s.id === chosenSemester)?.id ||
    semesters.data?.[0]?.id ||
    '';
  const semester = semesters.data?.find((s) => s.id === semesterId);
  const calendar = useQuery({
    queryKey: ['academic', 'calendar', semesterId],
    queryFn: () => academicApi.calendar(semesterId),
    enabled: !!semesterId,
    ...refresh,
  });
  const batches = useQuery({
    queryKey: ['academic', 'semester-subjects', semesterId],
    queryFn: () => academicApi.semesterCourses(semesterId),
    enabled: !!semesterId,
    ...refresh,
  });
  const linkedOfferings = new Set(
    batches.data?.flatMap((batch) =>
      batch.subjectOfferings.map((offering) => offering.id),
    ),
  );
  const loading =
    campuses.isPending || semesters.isLoading || subjects.isLoading;
  return (
    <section className="panel campus-academic-overview">
      <header className="workspace-heading">
        <div>
          <p className="workspace-kicker">Campus academics</p>
          <h2>Campus semesters and subjects</h2>
          <p>
            Shared semester dates, calendar and subjects maintained by your
            program manager.
          </p>
        </div>
        <span className="academic-readonly">View only</span>
      </header>
      <div className="form-grid campus-academic-filters">
        <label>
          Campus
          <select
            value={campusId}
            disabled={campuses.isPending}
            onChange={(e) => {
              setCampus(e.target.value);
              setSemester('');
            }}
          >
            {!campusId && (
              <option value="">
                {campuses.isPending
                  ? 'Loading campuses…'
                  : 'No campus available'}
              </option>
            )}
            {campuses.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Semester
          <select
            value={semesterId}
            disabled={!campusId || semesters.isLoading}
            onChange={(e) => setSemester(e.target.value)}
          >
            {!semesterId && (
              <option value="">
                {semesters.isLoading
                  ? 'Loading semesters…'
                  : 'No semesters yet'}
              </option>
            )}
            {semesters.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {dateLabel(s.startDate)} – {dateLabel(s.endDate)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {[campuses, semesters, subjects, calendar, batches].map((q, i) =>
        q.isError ? (
          <p className="form-error" role="alert" key={i}>
            {q.error.message}
          </p>
        ) : null,
      )}
      {loading ? (
        <LoadingSkeleton variant="cards" label="Loading campus records" />
      ) : (
        <>
          {semesters.isSuccess && !semesters.data.length && (
            <div className="empty-state">
              <h3>No semesters yet</h3>
              <p>No semesters have been created for this campus yet.</p>
            </div>
          )}
          {subjects.isSuccess && (
            <section
              className="campus-academic-section"
              aria-labelledby="campus-subjects-heading"
            >
              <div className="subheading-row">
                <h3 id="campus-subjects-heading">
                  Campus subjects{' '}
                  <span className="academic-count">{subjects.data.length}</span>
                </h3>
                <span className="academic-meta">
                  {batches.data
                    ? `${batches.data.length} ${batches.data.length === 1 ? 'batch' : 'batches'} in this semester`
                    : 'Shared campus catalog'}
                </span>
              </div>
              {!subjects.data.length ? (
                <p className="empty-copy">
                  No subjects have been created for this campus yet.
                </p>
              ) : (
                <div className="campus-subject-grid">
                  {subjects.data.map((subject) => {
                    const offerings =
                      subject.offerings?.filter((o) =>
                        linkedOfferings.has(o.id),
                      ) || [];
                    const defaultTeachers =
                      subject.teachers
                        ?.filter(
                          (t) =>
                            t.staffProfile.active &&
                            t.staffProfile.user.status === 'ACTIVE',
                        )
                        .map((t) => t.staffProfile.user.name) || [];
                    return (
                      <article className="campus-subject-card" key={subject.id}>
                        <header>
                          <span className="subject-code">{subject.code}</span>
                          <h4>{subject.name}</h4>
                        </header>
                        {batches.isLoading ? (
                          <p className="academic-meta">
                            Loading batch assignments…
                          </p>
                        ) : offerings.length ? (
                          <div className="campus-assignment-list">
                            {offerings.map((o) => (
                              <dl className="campus-assignment" key={o.id}>
                                <div>
                                  <dt>Batch</dt>
                                  <dd>{o.batch.name}</dd>
                                </div>
                                <div>
                                  <dt>Assigned teacher</dt>
                                  <dd
                                    className={
                                      !o.faculty.length
                                        ? 'subject-unassigned'
                                        : undefined
                                    }
                                  >
                                    {o.faculty
                                      .map((f) => f.staffProfile.user.name)
                                      .join(', ') ||
                                      'Not assigned to this batch'}
                                  </dd>
                                </div>
                              </dl>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-copy">
                            {subject.offerings?.length
                              ? 'Not linked to the selected semester.'
                              : 'Created in the campus catalog. The program manager must link it to a semester batch before you can schedule classes.'}
                          </p>
                        )}
                        {defaultTeachers.length > 0 && !offerings.length && (
                          <p className="academic-meta">
                            Campus teacher: {defaultTeachers.join(', ')}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}
      {calendar.isLoading ? (
        <LoadingSkeleton variant="table" label="Loading semester calendar" />
      ) : (
        calendar.data && (
          <section
            className="campus-academic-section"
            aria-labelledby="campus-calendar-heading"
          >
            <div className="subheading-row">
              <div>
                <h3 id="campus-calendar-heading">Semester calendar</h3>
                <p className="academic-meta">
                  {semester
                    ? `${dateLabel(semester.startDate)} – ${dateLabel(semester.endDate)}`
                    : ''}
                </p>
              </div>
              <span className="academic-meta">
                Working Saturdays:{' '}
                {readable(
                  calendar.data.semester.workingSaturdayRule ||
                    semester?.workingSaturdayRule ||
                    '',
                )}
              </span>
            </div>
            <div className="calendar-summary">
              <div>
                <span>Total dates</span>
                <strong>{calendar.data.summary.totalDays}</strong>
              </div>
              <div>
                <span>Teaching days</span>
                <strong>{calendar.data.summary.workingDays}</strong>
              </div>
              <div>
                <span>Non-teaching</span>
                <strong>{calendar.data.summary.nonWorkingDays}</strong>
              </div>
            </div>
            <div
              className="table-scroll campus-calendar-scroll"
              tabIndex={0}
              role="region"
              aria-label="Semester calendar"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Day</th>
                    <th scope="col">Calendar</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {calendar.data.days.map((day) => (
                    <tr key={day.date}>
                      <td>
                        <time dateTime={day.date}>{dateLabel(day.date)}</time>
                      </td>
                      <td>{readable(day.weekday)}</td>
                      <td>{day.override?.title || readable(day.reason)}</td>
                      <td>
                        <span
                          className={`day-state ${day.working ? 'working' : 'closed'}`}
                        >
                          {day.working ? 'Teaching' : 'Closed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}
      {calendar.data && (
        <section
          className="campus-academic-section"
          aria-labelledby="campus-exams-heading"
        >
          <div className="subheading-row">
            <h3 id="campus-exams-heading">
              Exam windows{' '}
              <span className="academic-count">
                {calendar.data.exams.length}
              </span>
            </h3>
          </div>
          {calendar.data.exams.length ? (
            <div className="campus-exam-grid">
              {calendar.data.exams.map((exam) => (
                <article className="campus-exam-window" key={exam.id}>
                  <span className="academic-meta">{readable(exam.type)}</span>
                  <h4>{exam.name}</h4>
                  <p>
                    {dateLabel(exam.startDate)} – {dateLabel(exam.endDate)}
                  </p>
                  <small>
                    Syllabus deadline: {dateLabel(exam.syllabusDeadline)}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              No exam windows have been added to this semester yet.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
