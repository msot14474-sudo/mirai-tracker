import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiUrl } from './http';
import { LoadingSkeleton } from './LoadingSkeleton';

export type CampusSnapshot = {
  generatedAt: string;
  summary: {
    subjects: number;
    attention: number;
    overdueTopics: number;
    missingLogs: number;
    needsHelp: number;
    reviews: number;
  };
  coverage: { pastLectures: number; upcomingLectures: number };
  subjects: {
    id: string;
    code: string;
    name: string;
    batch: string;
    completion: number | null;
    plannedMinutes: number;
    plan: { status: string } | null;
    topics: { minutes: number; completion: number; status: string }[];
    sessions: { status: string; count: number }[];
    exams: { scopeTopics: number; incompleteTopics: number }[];
  }[];
};
const colors = ['#3165da', '#53b7c3', '#eab464', '#b4c3db'];
export function campusMetrics(data: CampusSnapshot) {
  const topics = data.subjects.flatMap((s) => s.topics);
  const minutes = topics.reduce((total, t) => total + t.minutes, 0);
  const covered = topics.reduce(
    (total, t) => total + (t.minutes * t.completion) / 100,
    0,
  );
  const sessions = data.subjects.flatMap((s) => s.sessions);
  const count = (status: string) =>
    sessions
      .filter((s) => s.status === status)
      .reduce((n, s) => n + s.count, 0);
  return {
    progress: minutes ? Math.round((covered / minutes) * 100) : null,
    topics: [
      {
        label: 'Completed',
        value: topics.filter(
          (t) => t.completion >= 100 && t.status !== 'SKIPPED',
        ).length,
      },
      {
        label: 'In progress',
        value: topics.filter(
          (t) =>
            t.completion > 0 && t.completion < 100 && t.status !== 'SKIPPED',
        ).length,
      },
      {
        label: 'Not started',
        value: topics.filter((t) => t.completion <= 0 && t.status !== 'SKIPPED')
          .length,
      },
      {
        label: 'Skipped',
        value: topics.filter((t) => t.status === 'SKIPPED').length,
      },
    ],
    lectures: [
      { label: 'Completed', value: count('COMPLETED') },
      { label: 'Scheduled', value: count('SCHEDULED') },
      { label: 'Cancelled', value: count('CANCELLED') },
      {
        label: 'Other',
        value: sessions
          .filter(
            (s) => !['COMPLETED', 'SCHEDULED', 'CANCELLED'].includes(s.status),
          )
          .reduce((n, s) => n + s.count, 0),
      },
    ],
    plans: [
      {
        label: 'Active',
        value: data.subjects.filter((s) => s.plan?.status === 'ACTIVE').length,
      },
      {
        label: 'Draft',
        value: data.subjects.filter((s) => s.plan && s.plan.status !== 'ACTIVE')
          .length,
      },
      { label: 'Missing', value: data.subjects.filter((s) => !s.plan).length },
    ],
    exams: [
      {
        label: 'Ready',
        value: data.subjects.filter(
          (s) =>
            s.exams.length &&
            s.exams.every((e) => e.scopeTopics > 0 && e.incompleteTopics === 0),
        ).length,
      },
      {
        label: 'Needs coverage',
        value: data.subjects.filter((s) =>
          s.exams.some((e) => e.scopeTopics > 0 && e.incompleteTopics > 0),
        ).length,
      },
      {
        label: 'Scope missing',
        value: data.subjects.filter(
          (s) =>
            s.exams.length &&
            s.exams.some((e) => !e.scopeTopics) &&
            !s.exams.some((e) => e.scopeTopics > 0 && e.incompleteTopics > 0),
        ).length,
      },
      {
        label: 'No upcoming exam',
        value: data.subjects.filter((s) => !s.exams.length).length,
      },
    ],
  };
}
function Donut({
  title,
  items,
  note,
}: {
  title: string;
  items: { label: string; value: number }[];
  note: string;
}) {
  const total = items.reduce((n, s) => n + s.value, 0);
  let offset = 0;
  return (
    <section className="ca-card">
      <h2>{title}</h2>
      <div className="ca-donut-row">
        <svg
          viewBox="0 0 120 120"
          className="ca-donut"
          role="img"
          aria-label={
            total
              ? items.map((s) => s.label + ': ' + s.value).join(', ')
              : 'No data available'
          }
        >
          <circle
            cx="60"
            cy="60"
            r="45"
            fill="none"
            stroke="#edf1f7"
            strokeWidth="14"
          />
          {total
            ? items.map((s, i) => {
                const length = (s.value / total) * 100;
                const start = offset;
                offset += length;
                return (
                  <circle
                    key={s.label}
                    cx="60"
                    cy="60"
                    r="45"
                    fill="none"
                    stroke={colors[i]}
                    strokeWidth="14"
                    pathLength="100"
                    strokeDasharray={length + ' ' + (100 - length)}
                    strokeDashoffset={-start}
                    transform="rotate(-90 60 60)"
                  >
                    <title>
                      {s.label}: {s.value}
                    </title>
                  </circle>
                );
              })
            : null}
          <text x="60" y="59" textAnchor="middle" className="ca-total">
            {total || '—'}
          </text>
          <text x="60" y="75" textAnchor="middle" className="ca-total-label">
            {total ? 'total' : 'no data'}
          </text>
        </svg>
        <ul className="ca-legend">
          {items.map((s, i) => (
            <li key={s.label}>
              <span style={{ background: colors[i] }} />
              <span>{s.label}</span>
              <strong>{s.value}</strong>
            </li>
          ))}
        </ul>
      </div>
      <p className="ca-note">{note}</p>
    </section>
  );
}
export function CampusAnalytics({
  campusId,
  campusName,
  name,
}: {
  campusId?: string;
  campusName?: string;
  name: string;
}) {
  const query = useQuery({
    queryKey: ['ai-insights', campusId ?? '', ''],
    queryFn: async (): Promise<CampusSnapshot> => {
      const response = await apiFetch(
        apiUrl +
          '/ai-insights' +
          (campusId ? '?campusId=' + encodeURIComponent(campusId) : ''),
      );
      const data = await response.json();
      if (!data?.summary || !Array.isArray(data.subjects))
        throw new Error('Campus analytics could not be loaded.');
      return data;
    },
  });
  const data = query.data;
  const metrics = data ? campusMetrics(data) : null;
  return (
    <div className="campus-analytics">
      <header className="ca-heading">
        <div>
          <p>{campusName ?? 'Your permitted campuses'} · Overview</p>
          <h1>Welcome back, {name.trim().split(/\s+/)[0] || name}</h1>
        </div>
        <span>
          {data
            ? 'Updated ' +
              new Date(data.generatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Campus analytics'}
        </span>
      </header>
      {query.isPending ? (
        <LoadingSkeleton variant="cards" label="Loading campus analytics" />
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <button onClick={() => void query.refetch()}>Retry analytics</button>
        </div>
      ) : data && metrics ? (
        <>
          <div className="ca-kpis">
            {[
              ['Subject offerings', data.summary.subjects],
              [
                'Syllabus coverage',
                metrics.progress === null ? '—' : metrics.progress + '%',
              ],
              ['Need attention', data.summary.attention],
              ['Overdue topics', data.summary.overdueTopics],
              ['Missing lecture logs', data.summary.missingLogs],
              ['Upcoming lectures', data.coverage.upcomingLectures],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {!data.subjects.length ? (
            <p className="ca-empty">
              No academic records yet. Charts will populate as subjects, plans
              and lectures are added.
            </p>
          ) : null}
          <div className="ca-grid">
            <Donut
              title="Syllabus progress"
              items={metrics.topics}
              note="Topic counts across current lesson plans."
            />
            <section className="ca-card">
              <h2>Subject progression</h2>
              <div className="ca-bars">
                {[...data.subjects]
                  .sort((a, b) => (a.completion ?? -1) - (b.completion ?? -1))
                  .map((s) => (
                    <div key={s.id} className="ca-bar-row">
                      <div>
                        <span title={s.name + ' · ' + s.batch}>
                          {s.code} · {s.batch}
                        </span>
                        <strong>
                          {s.completion === null
                            ? 'No plan time'
                            : s.completion + '%'}
                        </strong>
                      </div>
                      <progress
                        max={100}
                        value={s.completion ?? 0}
                        aria-label={s.name + ' coverage'}
                      />
                    </div>
                  ))}
                {!data.subjects.length ? <p>No subjects yet.</p> : null}
              </div>
              <p className="ca-note">
                Weighted by planned teaching minutes; lowest coverage first.
              </p>
            </section>
            <Donut
              title="Lecture status"
              items={metrics.lectures}
              note="All recorded sessions, including future scheduled classes."
            />
            <Donut
              title="Student understanding"
              items={[
                {
                  label: 'Understood',
                  value: data.summary.reviews - data.summary.needsHelp,
                },
                { label: 'Needs help', value: data.summary.needsHelp },
              ]}
              note="Submitted lecture reviews, not unique students."
            />
            <Donut
              title="Lesson-plan readiness"
              items={metrics.plans}
              note="Current plan status per subject offering."
            />
            <Donut
              title="Exam readiness"
              items={metrics.exams}
              note="Subject offerings against upcoming exam scopes. Missing scope takes precedence only when no known gaps exist."
            />
          </div>
          <footer className="ca-footer">
            <span>
              Active and completed offerings · Current plans · All recorded
              lecture and feedback totals
            </span>
            <span>Missing logs do not mean a lecture was missed.</span>
          </footer>
        </>
      ) : null}
    </div>
  );
}
