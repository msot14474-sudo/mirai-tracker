import { useQuery } from '@tanstack/react-query';
import { BufferRatioValue, BufferRatioLegend } from './BufferRatio';
import { useState } from 'react';
import { LoadingSkeleton } from './LoadingSkeleton';
import {
  reportsApi,
  reportDate,
  reportNumber as num,
  ReportStatus,
} from './reports';
import { ReportBadge, ReportKpis } from './ReportsWorkspace';
import './reports.css';
const rank: Record<ReportStatus, number> = {
  DANGER: 4,
  TIGHT: 3,
  NEEDS_DATA: 2,
  ON_TRACK: 1,
  COMPLETE: 0,
};
export function AcademicOverview({
  campusId,
  campusName,
  name,
  faculty = false,
  onReports,
  onLessonPlan,
  onLog,
}: {
  campusId?: string;
  campusName?: string;
  name: string;
  faculty?: boolean;
  onReports?: (subjectId?: string) => void;
  onLessonPlan?: (offeringId: string) => void;
  onLog?: () => void;
}) {
  const [status, setStatus] = useState('ALL');
  const query = useQuery({
    queryKey: ['reports', 'summary', { campusId }],
    queryFn: () => reportsApi.summary({ campusId }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = query.data,
    s = data?.summary;
  const rows = [...(data?.subjects ?? [])]
    .filter((r) => status === 'ALL' || r.status === status)
    .sort(
      (a, b) =>
        rank[b.status] - rank[a.status] ||
        (b.metrics ? Math.max(0, -b.metrics.paceVsPlanHours) : 0) -
          (a.metrics ? Math.max(0, -a.metrics.paceVsPlanHours) : 0),
    );
  const scope =
    campusName ||
    [...new Set(data?.subjects.map((s) => s.campus.name))].join(', ') ||
    (faculty ? 'Your assigned subjects' : 'Your campuses');
  return (
    <section className="academic-overview" aria-label="Academic overview">
      <header className="rp-header ov-header">
        <div>
          <p className="rp-eyebrow">{scope}</p>
          <h1>{faculty ? 'Your teaching overview' : 'Overview'}</h1>
          <p>
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}{' '}
            · Welcome back, {name.split(' ')[0]}
          </p>
        </div>
        <div className="rp-header-actions">
          {onReports ? (
            <button
              type="button"
              className="rp-primary"
              onClick={() => onReports()}
            >
              View reports <span aria-hidden="true">↗</span>
            </button>
          ) : null}
          {faculty && onLog ? (
            <button type="button" className="rp-secondary" onClick={onLog}>
              Log a class
            </button>
          ) : null}
        </div>
      </header>
      {query.isPending ? (
        <LoadingSkeleton variant="cards" label="Loading academic overview" />
      ) : query.isError && !data ? (
        <div className="rp-empty" role="alert">
          <p>{query.error.message}</p>
          <button onClick={() => void query.refetch()}>Retry overview</button>
        </div>
      ) : data && s ? (
        <>
          <div className="ov-status-strip">
            <span>Overall status</span>
            <ReportBadge status={s.status} />
            <p>
              {s.worstSubject ? (
                <>
                  Determined by the worst subject:{' '}
                  <strong>{s.worstSubject}</strong>
                </>
              ) : (
                'Add subjects and lesson plans to begin monitoring.'
              )}
            </p>
            {s.needsData ? (
              <span className="ov-missing">
                {s.needsData}{' '}
                {s.needsData === 1 ? 'subject needs' : 'subjects need'} data
              </span>
            ) : null}
          </div>
          <ReportKpis
            items={[
              {
                label: 'Recorded syllabus coverage',
                value: num(s.metrics?.coveragePercentage, '%'),
                note: `Plan hours available for ${data.subjects.filter((r) => r.metrics).length} of ${s.subjects} subjects`,
              },
              {
                label: 'Hours behind plan',
                value: num(s.metrics ? s.behindHours : null, ' h'),
                note: 'Recorded shortfall across subjects',
              },
              {
                label: 'Subjects tight or in danger',
                value: s.atRisk,
                note: `${s.needsData} need data before assessment`,
              },
              {
                label: 'Next exam',
                value: s.nextExam
                  ? reportDate(s.nextExam.date)
                  : 'Not scheduled',
                note: s.nextExam
                  ? `${s.nextExam.name} · ${s.nextExam.campus}`
                  : 'No upcoming exam in your permitted scope',
              },
            ]}
          />
          <div className="ov-record-strip">
            <div>
              <strong>{s.logged}</strong>
              <span>classes with saved logs</span>
            </div>
            <div>
              <strong>{s.unlogged}</strong>
              <span>past classes without logs</span>
            </div>
            <div>
              <strong>{s.upcoming}</strong>
              <span>upcoming classes</span>
            </div>
            <p>
              Missing logs mean teaching is unverified. They do not confirm that
              a class was missed.
            </p>
          </div>
          {!faculty && data.groups.some((g) => g.kind === 'track') ? (
            <div className="ov-tracks" aria-label="Track status">
              {data.groups
                .filter((g) => g.kind === 'track')
                .map((g) => (
                  <div key={g.id}>
                    <span>
                      {g.name}
                      {data.groups.filter((x) => x.kind === 'campus').length > 1
                        ? ` · ${g.campus}`
                        : ''}
                    </span>
                    <ReportBadge status={g.status} />
                  </div>
                ))}
            </div>
          ) : null}
          <section
            className="ov-subject-section"
            aria-labelledby="overview-subjects"
          >
            <div className="rp-section-heading">
              <div>
                <h2 id="overview-subjects">
                  {faculty ? 'Your subjects' : 'Subject priorities'}
                </h2>
                <p>
                  Most urgent first. Expand a card to see the evidence behind
                  its status.
                </p>
              </div>
              <span className="ov-count">{s.subjects} subject offerings</span>
            </div>
            <div
              className="ov-status-filters"
              role="group"
              aria-label="Filter subject status"
            >
              {[
                'ALL',
                'DANGER',
                'TIGHT',
                'NEEDS_DATA',
                'ON_TRACK',
                'COMPLETE',
              ].map((value) => {
                const count =
                  value === 'ALL'
                    ? data.subjects.length
                    : data.subjects.filter((r) => r.status === value).length;
                return count || value === 'ALL' ? (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                  >
                    {value === 'ALL'
                      ? 'All subjects'
                      : value === 'NEEDS_DATA'
                        ? 'Needs data'
                        : value === 'ON_TRACK'
                          ? 'On track'
                          : value.charAt(0) + value.slice(1).toLowerCase()}{' '}
                    <span>{count}</span>
                  </button>
                ) : null;
              })}
            </div>
            <div className="ov-subject-grid">
              {rows.map((r) => (
                <article
                  key={r.id}
                  className={`ov-subject-card ov-${r.status.toLowerCase()}`}
                >
                  <header>
                    <div>
                      <h3>{r.subject.name}</h3>
                      <p>
                        {r.subject.code} · Batch: {r.batch.name} · Track:{' '}
                        {r.track.name}
                      </p>
                      <p>
                        {r.teachers.map((t) => t.name).join(', ') ||
                          'Teacher not assigned'}
                      </p>
                    </div>
                    <ReportBadge status={r.status} />
                  </header>
                  <dl className="ov-card-metrics">
                    <div>
                      <dt>Coverage</dt>
                      <dd>{num(r.metrics?.coveragePercentage, '%')}</dd>
                    </div>
                    <div>
                      <dt>Planned by today</dt>
                      <dd>
                        {num(
                          r.metrics && r.metrics.hoursInScope
                            ? (r.metrics.plannedHoursByToday /
                                r.metrics.hoursInScope) *
                                100
                            : null,
                          '%',
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Behind plan</dt>
                      <dd>
                        {num(
                          r.metrics
                            ? Math.max(0, -r.metrics.paceVsPlanHours)
                            : null,
                          ' h',
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Buffer ratio</dt>
                      <dd><BufferRatioValue metrics={r.metrics ? { ...r.metrics, status: r.status } : null} /></dd>
                    </div>
                  </dl>
                  {r.metrics ? (
                    <progress
                      max={100}
                      value={r.metrics.coveragePercentage}
                      aria-label={`${r.subject.name} recorded coverage`}
                    />
                  ) : (
                    <p className="ov-unknown">
                      Coverage unknown until lesson-plan hours are available.
                    </p>
                  )}
                  <p className="ov-reason">{r.reason}</p>
                  <details>
                    <summary>Why this status?</summary>
                    <BufferRatioLegend thresholds={r.metrics?.thresholds} />
                    <dl className="ov-detail-grid">
                      <div>
                        <dt>Semester</dt>
                        <dd>{r.semester.name}</dd>
                      </div>
                      <div>
                        <dt>Syllabus deadline</dt>
                        <dd>{reportDate(r.deadline)}</dd>
                      </div>
                      <div>
                        <dt>Current plan</dt>
                        <dd>
                          {r.planStatus
                            ? `Version ${r.planVersion} · ${r.planStatus.toLowerCase()}`
                            : 'Not uploaded'}
                        </dd>
                      </div>
                      <div>
                        <dt>Saved class logs</dt>
                        <dd>{r.logged}</dd>
                      </div>
                      <div>
                        <dt>Past classes without logs</dt>
                        <dd>{r.unlogged}</dd>
                      </div>
                      <div>
                        <dt>Next topic</dt>
                        <dd>{r.nextTopic || 'No pending topic recorded'}</dd>
                      </div>
                    </dl>
                    <p>
                      Coverage comes from saved topic progress. Available hours
                      are usable timetable hours after today, up to the
                      deadline.
                    </p>
                  </details>
                  {r.reviewChanges ? (
                    <p className="ov-review">
                      {r.reviewChanges} calendar changes need a replacement
                      decision.
                    </p>
                  ) : null}
                  <footer>
                    {onReports ? (
                      <button
                        type="button"
                        onClick={() => onReports(r.subject.id)}
                      >
                        Subject report <span aria-hidden="true">↗</span>
                      </button>
                    ) : null}
                    {faculty && onLessonPlan ? (
                      <button type="button" onClick={() => onLessonPlan(r.id)}>
                        Open lesson plans
                      </button>
                    ) : null}
                  </footer>
                </article>
              ))}
            </div>
            {!rows.length ? (
              <div className="rp-empty">
                <strong>
                  {data.subjects.length
                    ? 'No subjects match this status'
                    : 'No linked subjects yet'}
                </strong>
                <p>
                  {data.subjects.length
                    ? 'Choose another status above.'
                    : 'Subjects appear after they are linked to a semester and batch. Faculty see only their assigned subjects.'}
                </p>
              </div>
            ) : null}
          </section>
          <footer className="rp-footnote">
            Updated {new Date(data.generatedAt).toLocaleTimeString()} · Current
            saved progress · Campus and track status follow the worst subject.
          </footer>
        </>
      ) : null}
    </section>
  );
}
