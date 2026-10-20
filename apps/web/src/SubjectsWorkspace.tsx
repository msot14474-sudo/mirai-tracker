import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CampusDataScope } from './CampusDataScope';
import { academicApi } from './academic';
import { reportsApi, CourseReport, reportDate, reportNumber } from './reports';
import { ReportBadge, ReportContent, ReportKpis } from './ReportsWorkspace';
import { lessonPlanApi } from './lessonPlans';
import { timetableApi } from './timetable';
import { LoadingSkeleton } from './LoadingSkeleton';
import { SubjectSetup } from './SemesterSetup';
import './subjectsWorkspace.css';

export function SubjectsWorkspace({
  campusId,
  canDelete = false,
}: {
  campusId?: string;
  canDelete?: boolean;
}) {
  return (
    <CampusDataScope
      initialCampusId={campusId}
      title="Subjects"
      description="Explore each subject’s teaching plan, faculty, class history and exam readiness."
    >
      {(semester) => (
        <SubjectDirectory
          campusId={semester.campusId}
          semesterId={semester.id}
          canDelete={canDelete}
        />
      )}
    </CampusDataScope>
  );
}
function SubjectDirectory({
  campusId,
  semesterId,
  canDelete,
}: {
  campusId: string;
  semesterId: string;
  canDelete: boolean;
}) {
  const [selected, setSelected] = useState<CourseReport | null>(null);
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState('');
  const catalog = useQuery({
    queryKey: ['academic', 'subjects', campusId],
    queryFn: () => academicApi.subjects(campusId),
  });
  const query = useQuery({
    queryKey: ['reports', { campusId, semesterId }],
    queryFn: () => reportsApi.read({ campusId, semesterId }),
    refetchOnWindowFocus: true,
  });
  if (selected)
    return (
      <SubjectDetail offering={selected} onBack={() => setSelected(null)} />
    );
  if (create)
    return (
      <section className="subject-directory">
        <button className="secondary-button" onClick={() => setCreate(false)}>
          Back to subjects
        </button>
        <SubjectSetup
          campusId={campusId}
          initialSemesterId={semesterId}
          showCreate
          canAssignTeachers
          canDelete={canDelete}
          onCreated={() => setCreate(false)}
        />
      </section>
    );
  return (
    <section className="subject-directory">
      <div className="subject-directory-toolbar">
        <div>
          <h3>{catalog.data?.length ?? 0} campus subjects</h3>
          <p>
            Select a batch subject to see its complete record for this semester.
          </p>
        </div>
        <button className="primary-button" onClick={() => setCreate(true)}>
          Add subject
        </button>
      </div>
      <div className="form-grid">
        <label>
          Find a subject
          <input
            type="search"
            placeholder="Subject name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Subject track
          <select value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="">Both tracks</option>
            <option value="MIRAI">Mirai</option>
            <option value="UNIVERSITY">University</option>
          </select>
        </label>
      </div>
      {(query.isPending || catalog.isPending) && (
        <LoadingSkeleton variant="cards" />
      )}
      {(query.error || catalog.error) && (
        <p role="alert" className="form-error">
          {query.error?.message || catalog.error?.message}
        </p>
      )}
      <div className="subject-directory-grid">
        {catalog.data
          ?.filter((s) =>
            `${s.name} ${s.code}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((s) => {
            const offerings =
              query.data?.subjects.filter((o) => o.subject.id === s.id) ?? [];
            const visible = offerings.filter(
              (o) => !track || o.track.id === track,
            );
            if (track && !visible.length) return null;
            return (
              <article className="subject-directory-card" key={s.id}>
                <header>
                  <span className="subject-code">{s.code}</span>
                  <h3>{s.name}</h3>
                </header>
                {visible.map((o) => (
                  <button
                    className="subject-offering-link"
                    key={o.id}
                    onClick={() => setSelected(o)}
                  >
                    <span>
                      <strong>{o.batch.name}</strong>
                      <small>
                        {o.track.name} ·{' '}
                        {o.teachers.map((t) => t.name).join(', ') ||
                          'Teacher not assigned'}
                      </small>
                    </span>
                    <span>
                      <ReportBadge status={o.status} />
                      <small>
                        {reportNumber(o.metrics?.coveragePercentage, '%')}{' '}
                        covered →
                      </small>
                    </span>
                  </button>
                ))}
                {!offerings.length && (
                  <p className="academic-meta">
                    Not linked to this semester. Open Add subject to manage the
                    campus catalog and link an existing subject to a batch.
                  </p>
                )}
              </article>
            );
          })}
      </div>
      {catalog.isSuccess && !catalog.data.length && (
        <p className="empty-copy">
          No subjects yet. Add the first subject for this campus.
        </p>
      )}
    </section>
  );
}
function SubjectDetail({
  offering,
  onBack,
}: {
  offering: CourseReport;
  onBack: () => void;
}) {
  const [tab, setTab] = useState('overview');
  const plan = useQuery({
    queryKey: ['lesson-plans', 'offering', offering.id],
    queryFn: () => lessonPlanApi.offering(offering.id),
  });
  const timetable = useQuery({
    queryKey: ['timetable', 'offering', offering.id],
    queryFn: () => timetableApi.offering(offering.id),
  });
  const reports = useQuery({
    queryKey: [
      'reports',
      {
        campusId: offering.campus.id,
        semesterId: offering.semester.id,
        batchId: offering.batch.id,
        subjectId: offering.subject.id,
        deliveryStatus: 'ALL',
      },
    ],
    queryFn: () =>
      reportsApi.read({
        campusId: offering.campus.id,
        semesterId: offering.semester.id,
        batchId: offering.batch.id,
        subjectId: offering.subject.id,
        deliveryStatus: 'ALL',
      }),
    refetchOnWindowFocus: true,
  });
  const current =
    reports.data?.subjects.find((s) => s.id === offering.id) ?? offering;
  const metrics = current.metrics;
  const upcoming =
    timetable.data?.sessions.filter(
      (s) =>
        new Date(s.startsAt) > new Date() &&
        ['SCHEDULED', 'IN_PROGRESS'].includes(s.status),
    ) ?? [];
  const units = plan.data?.plan?.units ?? [];
  const taught =
    reports.data?.delivery.filter((s) =>
      ['COMPLETED', 'IN_PROGRESS'].includes(s.status),
    ) ?? [];
  const tz = timetable.data?.semester.campus.timezone ?? 'Asia/Kolkata';
  return (
    <section className="subject-detail reports-workspace">
      <button className="subject-back" onClick={onBack}>
        ← All subjects
      </button>
      <header className="rp-header">
        <div>
          <p className="rp-eyebrow">
            {current.subject.code} · {current.track.name}
          </p>
          <h1>{current.subject.name}</h1>
          <p>
            {current.campus.name} · {current.semester.name} ·{' '}
            {current.batch.name}
          </p>
        </div>
        <ReportBadge status={current.status} />
      </header>
      <div className="subject-teacher-strip">
        <span>Assigned teacher</span>
        <strong>
          {current.teachers.map((t) => t.name).join(', ') || 'Not assigned'}
        </strong>
        <span>
          {timetable.data
            ? `${reportNumber(timetable.data.summary.weeklyPlannedMinutes / 60)} h per week`
            : 'Loading assigned hours…'}
        </span>
      </div>
      <ReportKpis
        items={[
          {
            label: 'Syllabus covered',
            value: reportNumber(metrics?.coveragePercentage, '%'),
            note: `${reportNumber(metrics?.coveredHours, ' h')} recorded`,
          },
          {
            label: 'Syllabus remaining',
            value: reportNumber(metrics?.remainingHours, ' h'),
            note: 'From the current lesson plan',
          },
          {
            label: 'Teaching time left',
            value: reportNumber(metrics?.availableHours, ' h'),
            note: `Target ${reportDate(current.deadline)}`,
          },
          {
            label: 'Classes recorded',
            value: current.logged,
            note: `${current.unlogged} awaiting logs · ${current.upcoming} upcoming`,
          },
        ]}
      />
      <div className="rp-tabbar" role="tablist" aria-label="Subject details">
        {[
          ['overview', 'Overview'],
          ['lectures', 'Lectures'],
          ['plan', 'Teaching plan & syllabus'],
          ['exams', 'Exam syllabus & readiness'],
        ].map(([id, label]) => (
          <button
            role="tab"
            id={`subject-tab-${id}`}
            aria-controls="subject-detail-panel"
            aria-selected={tab === id}
            key={id}
            onClick={() => setTab(id!)}
          >
            {label}
          </button>
        ))}
      </div>
      {[plan.error, timetable.error, reports.error]
        .filter(Boolean)
        .map((e, i) => (
          <p role="alert" className="form-error" key={i}>
            {e?.message}
          </p>
        ))}
      <div
        id="subject-detail-panel"
        role="tabpanel"
        aria-labelledby={`subject-tab-${tab}`}
      >
        {tab === 'overview' && (
          <div className="subject-detail-grid">
            <article>
              <h3>Progress and next steps</h3>
              <p>{current.reason}</p>
              <dl>
                <dt>Next topic</dt>
                <dd>{current.nextTopic || 'No upcoming topic scheduled'}</dd>
                <dt>Teaching plan</dt>
                <dd>
                  {plan.data?.plan
                    ? `Version ${plan.data.plan.version} · ${plan.data.plan.status.toLowerCase()}`
                    : plan.isPending
                      ? 'Loading…'
                      : 'Not uploaded'}
                </dd>
                <dt>Time cushion</dt>
                <dd>{reportNumber(metrics?.bufferRatio, '×')}</dd>
                <dt>Recorded taught classes</dt>
                <dd>{taught.length}</dd>
              </dl>
            </article>
            <article>
              <h3>Next lectures</h3>
              {upcoming.slice(0, 5).map((s) => (
                <p key={s.id}>
                  <strong>{reportDate(s.sessionDate)}</strong> ·{' '}
                  {new Date(s.startsAt).toLocaleTimeString(undefined, {
                    timeZone: tz,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {reportNumber(s.plannedMinutes / 60, ' h')}
                </p>
              ))}
              {!upcoming.length && (
                <p>
                  {timetable.isPending
                    ? 'Loading classes…'
                    : 'No upcoming lectures scheduled.'}
                </p>
              )}
              <button
                className="secondary-button"
                onClick={() => setTab('lectures')}
              >
                View all lectures
              </button>
            </article>
          </div>
        )}
        {tab === 'lectures' && (
          <>
            <section className="rp-results">
              <div className="rp-section-heading">
                <h3>Upcoming lectures ({upcoming.length})</h3>
                <p>Times shown in {tz}.</p>
              </div>
              <div
                className="rp-table-scroll subject-record-scroll"
                tabIndex={0}
                role="region"
                aria-label="Upcoming lectures"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Hours</th>
                      <th>Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((s) => (
                      <tr key={s.id}>
                        <td>{reportDate(s.sessionDate)}</td>
                        <td>
                          {new Date(s.startsAt).toLocaleTimeString(undefined, {
                            timeZone: tz,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          –{' '}
                          {new Date(s.endsAt).toLocaleTimeString(undefined, {
                            timeZone: tz,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>{reportNumber(s.plannedMinutes / 60)}</td>
                        <td>
                          {s.isExtraSession ? 'Extra class' : 'Scheduled'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!upcoming.length && (
                  <p className="rp-empty">No upcoming lectures.</p>
                )}
              </div>
            </section>
            <section className="rp-results">
              <div className="rp-section-heading">
                <h3>Saved lecture logs</h3>
                <p>
                  Completed, in-progress, skipped, merged and cancelled logs.
                  Missing logs are not counted as taught.
                </p>
              </div>
              {reports.data ? (
                <ReportContent tab="delivery" data={reports.data} />
              ) : (
                <LoadingSkeleton />
              )}
            </section>
          </>
        )}
        {tab === 'plan' && (
          <section className="rp-results">
            <div className="rp-section-heading">
              <div>
                <h3>Teaching plan and covered syllabus</h3>
                <p>
                  {plan.data?.plan
                    ? `${plan.data.plan.fileName || 'Lesson plan'} · Version ${plan.data.plan.version} · ${plan.data.plan.status.toLowerCase()}`
                    : 'No lesson plan uploaded.'}
                </p>
              </div>
            </div>
            {units.map((u) => (
              <section className="subject-unit" key={u.id}>
                <h4>
                  {u.sequence}. {u.title}
                </h4>
                <div className="rp-table-scroll" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Topic</th>
                        <th>Planned hours</th>
                        <th>Covered</th>
                        <th>Status</th>
                        <th>Exam syllabus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {u.topics.map((t) => (
                        <tr key={t.id}>
                          <td>{t.title}</td>
                          <td>{reportNumber(t.plannedMinutes / 60)}</td>
                          <td>
                            {reportNumber(
                              Number(t.currentCompletionPercentage),
                              '%',
                            )}
                          </td>
                          <td>{t.status.toLowerCase().replaceAll('_', ' ')}</td>
                          <td>
                            {t.examScopes.map((e) => e.name).join(', ') ||
                              'Not in exam scope'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </section>
        )}
        {tab === 'exams' && (
          <>
            <section className="rp-results">
              {reports.data ? (
                <ReportContent tab="exams" data={reports.data} />
              ) : (
                <LoadingSkeleton />
              )}
            </section>
            <section className="subject-detail-grid">
              {plan.data?.examWindows.map((e) => (
                <article key={e.id}>
                  <h3>{e.name}</h3>
                  <p>
                    {reportDate(e.startDate)} – {reportDate(e.endDate)}
                  </p>
                  <p>Syllabus deadline: {reportDate(e.syllabusDeadline)}</p>
                  <ul>
                    {units
                      .flatMap((u) => u.topics)
                      .filter((t) =>
                        t.examScopes.some((scope) => scope.id === e.id),
                      )
                      .map((t) => (
                        <li key={t.id}>
                          {t.title} ·{' '}
                          {reportNumber(
                            Number(t.currentCompletionPercentage),
                            '%',
                          )}{' '}
                          covered
                        </li>
                      ))}
                  </ul>
                  {!units.some((u) =>
                    u.topics.some((t) =>
                      t.examScopes.some((scope) => scope.id === e.id),
                    ),
                  ) && <p>Syllabus scope has not been set for this exam.</p>}
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
