import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LessonPlanDetail, formatTeachingTime } from './lessonPlans';
import { topicScheduleApi } from './topicSchedules';
import { CalendarChangeReview } from './CalendarChangeReview';

export function FacultyPlanSchedule({ detail }: { detail: LessonPlanDetail }) {
  const client = useQueryClient();
  const schedule = useQuery({
    queryKey: ['topic-schedules', 'offering', detail.id],
    queryFn: () => topicScheduleApi.offering(detail.id),
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
  });
  const refresh = async () => {
    await Promise.all(
      [
        'topic-schedules',
        'lesson-plans',
        'timetable',
        'progress-dashboard',
        'exam-readiness',
        'session-logs',
        'student-overview',
        'ai-insights',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  };
  if (schedule.isPending)
    return <p role="status">Checking assigned teaching hours…</p>;
  if (!schedule.data)
    return (
      <p className="form-error" role="alert">
        {schedule.error?.message || 'Teaching hours could not be loaded.'}
      </p>
    );
  const data = schedule.data;
  const available = data.sessions.filter(
    (s) => !['CANCELLED', 'SKIPPED', 'MERGED'].includes(s.status),
  );
  const total = available.reduce((n, s) => n + s.plannedMinutes, 0);
  const remaining = available
    .filter((s) => !s.hasLogs && new Date(s.startsAt) > new Date())
    .reduce((n, s) => n + s.plannedMinutes, 0);
  const planned = detail.plan?.summary.totalPlannedMinutes ?? 0;
  const planMatches = !detail.plan || data.plan?.id === detail.plan.id;
  const shortfall = planMatches
    ? (data.forecast?.summary.shortfallMinutes ?? Math.max(0, planned - total))
    : Math.max(0, planned - total);
  return (
    <div className="faculty-plan-schedule">
      <div className="subheading-row">
        <div>
          <span className="eyebrow">Your teaching plan</span>
          <h3>{detail.subject.name}</h3>
          <p>
            {detail.batch.name} · {detail.semester.name}
          </p>
        </div>
        <span className="readonly-badge">Live timetable</span>
      </div>
      <div className="plan-capacity-metrics">
        <div>
          <span>Assigned teaching time</span>
          <strong>{formatTeachingTime(total)}</strong>
          <small>
            {available.length} {available.length === 1 ? 'class' : 'classes'} in
            the semester
          </small>
        </div>
        <div>
          <span>Upcoming teaching time</span>
          <strong>{formatTeachingTime(remaining)}</strong>
          <small>Unlogged future classes</small>
        </div>
        <div>
          <span>Lesson plan</span>
          <strong>{formatTeachingTime(planned)}</strong>
          <small>
            {detail.plan
              ? `${detail.plan.summary.topics} topics`
              : 'Upload your topics below'}
          </small>
        </div>
      </div>
      {!available.length && (
        <p className="inline-notice">
          Your campus manager needs to add the subject’s timetable. You can
          prepare your lesson plan now; topic dates will appear when teaching
          hours are assigned.
        </p>
      )}
      {shortfall > 0 && (
        <p className="inline-notice">
          {formatTeachingTime(shortfall)} of remaining work does not fit in the
          available classes. Review the plan or arrange another class; topic
          hours are kept as entered.
        </p>
      )}
      <CalendarChangeReview sessions={data.sessions} onChanged={refresh} />
      {detail.plan && (
        <details className="plan-timeline" open>
          <summary>Topic progression and dates</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Planned time</th>
                  <th>Covered</th>
                  <th>Next teaching dates</th>
                </tr>
              </thead>
              <tbody>
                {detail.plan.units.flatMap((unit) =>
                  unit.topics.map((topic) => {
                    const allocation = (
                      data.forecast ?? data.preview
                    ).allocations.find((a) => a.id === topic.id);
                    const complete = topic.currentCompletionPercentage >= 100;
                    return (
                      <tr key={topic.id}>
                        <td>
                          <small>{unit.title}</small>
                          <strong>{topic.title}</strong>
                        </td>
                        <td>{formatTeachingTime(topic.plannedMinutes)}</td>
                        <td>
                          <progress
                            max={100}
                            value={topic.currentCompletionPercentage}
                            aria-label={`${topic.title} coverage`}
                          />{' '}
                          {Math.round(topic.currentCompletionPercentage)}%
                        </td>
                        <td>
                          {complete
                            ? 'Completed'
                            : topic.status === 'SKIPPED'
                              ? 'Skipped'
                              : !planMatches
                                ? 'Activate this version to schedule'
                                : allocation
                                  ? `${allocation.plannedStartDate} → ${allocation.plannedFinishDate}`
                                  : 'Needs teaching time'}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
