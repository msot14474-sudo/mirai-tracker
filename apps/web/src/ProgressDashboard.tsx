import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RecoveryPlanner } from './RecoveryPlanner';
import { LoadingSkeleton } from './LoadingSkeleton';
import {
  ProgressGroup,
  ProgressMetrics,
  ProgressRollup,
  ProgressStatus,
  progressApi,
  SubjectProgress,
} from './progress';

const statusLabels: Record<ProgressStatus, string> = {
  ON_TRACK: 'ON TRACK',
  TIGHT: 'TIGHT',
  DANGER: 'DANGER',
  COMPLETE: 'COMPLETE',
};

export function ProgressDashboard({
  scope,
  campusId,
}: {
  scope: 'faculty' | 'manager';
  campusId?: string;
}) {
  const [asOfDate, setAsOfDate] = useState(today());
  const [search, setSearch] = useState('');
  const dashboard = useQuery({
    queryKey: ['progress-dashboard', asOfDate, campusId],
    queryFn: () => progressApi.dashboard(asOfDate, campusId),
  });
  const visibleSubjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return dashboard.data?.subjects ?? [];
    return (dashboard.data?.subjects ?? []).filter((subject) =>
      [
        subject.subject.code,
        subject.subject.name,
        subject.batch.name,
        subject.track.name,
        subject.campus.name,
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [dashboard.data?.subjects, search]);

  return (
    <section className="progress-dashboard" aria-labelledby="progress-title">
      <div className="progress-heading">
        <div>
          <h2 id="progress-title">Progress dashboard</h2>
        </div>
        <div className="progress-date-control">
          <label htmlFor="progress-as-of">Position as of</label>
          <input
            id="progress-as-of"
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
          />
        </div>
      </div>

      <div className="rollup-rule" role="note">
        <strong>Roll-up rule</strong>
        <span>
          Track and campus status is the worst visible subject, never an
          average.
        </span>
      </div>

      {dashboard.isLoading ? (
        <LoadingSkeleton variant="panel" label="Calculating progress" />
      ) : dashboard.isError ? (
        <p className="form-error" role="alert">
          {dashboard.error.message}
        </p>
      ) : !dashboard.data?.summary ? (
        <div className="empty-state compact-empty">
          <span>11</span>
          <h3>No progress to calculate yet</h3>
          <p>
            Progress appears after a linked subject has an active lesson plan.
            {scope === 'faculty'
              ? ' Open Lesson plans to upload and activate your assigned subject’s plan. Your campus manager sets its class timetable.'
              : ' Administrators link subjects to semester batches; campus managers assign teachers and set the timetable. Faculty then upload and activate their lesson plans.'}
          </p>
        </div>
      ) : (
        <>
          <section className="progress-overview" aria-label="Overall progress">
            <div className="overview-label">
              <span>Visible scope</span>
              <strong>{dashboard.data.summary.subjectCount} subjects</strong>
            </div>
            <StatusBadge status={dashboard.data.summary.status} />
            <Coverage value={dashboard.data.summary.coveragePercentage} />
            <Metrics metrics={dashboard.data.summary} />
          </section>

          <RollupSection
            title="Campus position"
            label="Campus roll-ups"
            groups={dashboard.data.campuses}
          />
          <RollupSection
            title="Track position"
            label="Track roll-ups"
            groups={dashboard.data.tracks}
          />

          <RecoveryPlanner subjects={dashboard.data.subjects} />

          <section
            className="subject-progress"
            aria-labelledby="subjects-title"
          >
            <div className="subject-progress-heading">
              <div>
                <h3 id="subjects-title">Subjects needing your attention</h3>
              </div>
              <div>
                <label htmlFor="progress-search">Find a subject</label>
                <input
                  id="progress-search"
                  type="search"
                  placeholder="Subject, campus or track"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="subject-progress-grid">
              {visibleSubjects.map((subject) => (
                <SubjectCard key={subject.id} subject={subject} />
              ))}
            </div>
            {visibleSubjects.length === 0 ? (
              <p className="empty-copy">No subjects match that search.</p>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}

function RollupSection({
  title,
  label,
  groups,
}: {
  title: string;
  label: string;
  groups: ProgressGroup[];
}) {
  return (
    <section className="progress-rollups" aria-label={label}>
      <div className="subheading-row">
        <div>
          <p className="step-label">Worst subject decides status</p>
          <h3>{title}</h3>
        </div>
        <span>{groups.length} groups</span>
      </div>
      <div className="rollup-grid">
        {groups.map((group) => (
          <article className="rollup-card" key={group.id}>
            <div className="rollup-card-heading">
              <div>
                <small>{group.code}</small>
                <h4>{group.name}</h4>
                <span>{group.subjectCount} subjects</span>
              </div>
              <StatusBadge status={group.status} />
            </div>
            <Coverage value={group.coveragePercentage} />
            <Metrics metrics={group} compact />
            <p className="overdue-count">
              {group.overdueTopics} overdue topic
              {group.overdueTopics === 1 ? '' : 's'}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SubjectCard({ subject }: { subject: SubjectProgress }) {
  return (
    <article className={`subject-card status-${subject.status.toLowerCase()}`}>
      <div className="subject-card-heading">
        <div>
          <small>
            {subject.subject.code} · {subject.batch.name}
          </small>
          <h4>{subject.subject.name}</h4>
          <span>
            {subject.campus.name} · {subject.track.name}
          </span>
        </div>
        <StatusBadge status={subject.status} />
      </div>
      <Coverage value={subject.coveragePercentage} />
      <Metrics metrics={subject} />
      <div className="subject-card-footer">
        <span>Target {displayDate(subject.targetFinishDate)}</span>
        <span>
          Plan v{subject.lessonPlan.version} · Schedule v
          {subject.scheduleVersion ?? '—'}
        </span>
      </div>
      {subject.overdueTopics.length > 0 ? (
        <div className="overdue-topics">
          <strong>Overdue topics</strong>
          {subject.overdueTopics.map((topic) => (
            <span key={topic.id}>
              {topic.title} · {formatNumber(topic.completionPercentage)}%
            </span>
          ))}
        </div>
      ) : (
        <p className="on-time-copy">No overdue topics</p>
      )}
    </article>
  );
}

function Metrics({
  metrics,
  compact = false,
}: {
  metrics: ProgressMetrics | ProgressRollup;
  compact?: boolean;
}) {
  const values = [
    ['Planned hours', hours(metrics.hoursInScope)],
    ['Covered hours', hours(metrics.coveredHours)],
    ['Coverage', `${formatNumber(metrics.coveragePercentage)}%`],
    ['Remaining hours', hours(metrics.remainingHours)],
    ['Available hours', hours(metrics.availableHours)],
    ['Planned by today', hours(metrics.plannedHoursByToday)],
    [
      'Buffer ratio',
      metrics.bufferRatio === null
        ? 'Complete'
        : `${formatNumber(metrics.bufferRatio)}×`,
    ],
    ['Pace vs plan', pace(metrics.paceVsPlanHours)],
  ];
  return (
    <dl className={compact ? 'progress-metrics compact' : 'progress-metrics'}>
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusBadge({ status }: { status: ProgressStatus }) {
  return (
    <span className={`progress-status ${status.toLowerCase()}`}>
      {statusLabels[status]}
    </span>
  );
}

function Coverage({ value }: { value: number }) {
  return (
    <div
      className="coverage-bar"
      aria-label={`${formatNumber(value)}% covered`}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function hours(value: number) {
  return `${formatNumber(value)}h`;
}

function pace(value: number) {
  if (value === 0) return 'On plan';
  return `${value > 0 ? '+' : '−'}${hours(Math.abs(value))}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
    value,
  );
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function today() {
  const current = new Date();
  const offset = current.getTimezoneOffset() * 60_000;
  return new Date(current.getTime() - offset).toISOString().slice(0, 10);
}
