import { useState } from 'react';
import { BufferRatio, BufferRatioValue } from './BufferRatio';
import { useQuery } from '@tanstack/react-query';
import { CampusDataScope } from './CampusDataScope';
import { academicApi } from './academic';
import { academicTrackIdentity } from './tracks';
import { reportsApi, ReportBase, reportDate, reportNumber } from './reports';
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
      renderAllSemesters={(id) => (
        <SubjectDirectory campusId={id} canDelete={canDelete} />
      )}
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
  semesterId?: string;
  canDelete: boolean;
}) {
  const [selected, setSelected] = useState<ReportBase | null>(null);
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState('');
  const catalog = useQuery({
    queryKey: ['academic', 'subjects', campusId],
    queryFn: () => academicApi.subjects(campusId),
  });
  const query = useQuery({
    queryKey: ['reports', 'summary', { campusId }],
    queryFn: () => reportsApi.summary({ campusId }),
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
            Open a subject to see its progress, teacher, timetable, lesson plan
            and exams. The semester and batch are shown on each link.
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
      {catalog.isPending && <LoadingSkeleton variant="cards" />}
      {catalog.error && (
        <p role="alert" className="form-error">
          {catalog.error.message}
          <button onClick={() => void catalog.refetch()}>Retry subjects</button>
        </p>
      )}
      <div className="subject-directory-grid">
        {catalog.data
          ?.filter((s) =>
            `${s.name} ${s.code}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((s) => {
            const offerings = s.offerings ?? [];
            const visible = offerings.filter(
              (o) =>
                (!semesterId || o.batch.semester.id === semesterId) &&
                (!track || o.academicTrack === track),
            );
            if ((track || semesterId) && !visible.length) return null;
            return (
              <article className="subject-directory-card" key={s.id}>
                <header>
                  <span className="subject-code">{s.code}</span>
                  <h3>{s.name}</h3>
                </header>
                {visible.map((o) => {
                  const progress = query.data?.subjects.find(
                    (row) => row.id === o.id,
                  );
                  const identity: ReportBase = {
                    id: o.id,
                    subject: s,
                    campus: { id: campusId, name: '' },
                    semester: {
                      id: o.batch.semester.id ?? '',
                      name: o.batch.semester.name,
                    },
                    batch: { id: o.batch.id ?? '', name: o.batch.name },
                    track: academicTrackIdentity(o.academicTrack),
                    teachers: o.faculty.map((f) => ({
                      id: f.staffProfile.id,
                      name: f.staffProfile.user.name,
                    })),
                  };
                  return (
                    <button
                      className="subject-offering-link"
                      key={o.id}
                      aria-label={`Open ${s.name} · ${o.batch.name} · ${o.batch.semester.name}`}
                      onClick={() => setSelected(identity)}
                    >
                      <span>
                        <strong>{o.batch.semester.name}</strong>
                        <small>
                          {o.batch.name} · {identity.track.name}
                        </small>
                        <small>
                          {identity.teachers.map((t) => t.name).join(', ') ||
                            'Teacher assignment pending'}
                        </small>
                      </span>
                      <span>
                        {progress && (
                          <>
                            <ReportBadge status={progress.status} />
                            <small>
                              {reportNumber(
                                progress.metrics?.coveragePercentage,
                                '%',
                              )}{' '}
                              covered
                            </small>
                            <small>
                              Buffer ratio:{' '}
                              <BufferRatioValue
                                metrics={
                                  progress.metrics
                                    ? {
                                        ...progress.metrics,
                                        status: progress.status,
                                      }
                                    : null
                                }
                              />
                            </small>
                          </>
                        )}
                        <strong>View subject →</strong>
                      </span>
                    </button>
                  );
                })}
                {!offerings.length && (
                  <div className="academic-meta">
                    <p>No batch has been assigned to this subject yet.</p>
                    <button
                      className="secondary-button"
                      onClick={() => setCreate(true)}
                    >
                      Link subject to a batch
                    </button>
                  </div>
                )}
              </article>
            );
          })}
      </div>
      {catalog.isSuccess &&
        !catalog.data.some(
          (s) =>
            `${s.name} ${s.code}`
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            (!(track || semesterId) ||
              s.offerings?.some(
                (o) =>
                  (!semesterId || o.batch.semester.id === semesterId) &&
                  (!track || o.academicTrack === track),
              )),
        ) && (
          <p className="empty-copy">
            No subjects match these filters. Choose All semesters to see the
            campus catalog.
          </p>
        )}
      {query.error && (
        <div role="status" className="academic-meta">
          Progress could not be refreshed. Subject links are still available.
          <button
            className="secondary-button"
            onClick={() => void query.refetch()}
          >
            Refresh progress
          </button>
        </div>
      )}
    </section>
  );
}
function SubjectDetail({
  offering,
  onBack,
}: {
  offering: ReportBase;
  onBack: () => void;
}) {
  const [tab, setTab] = useState('overview');
  const plan = useQuery({
    queryKey: ['lesson-plans', 'offering', offering.id],
    queryFn: () => lessonPlanApi.offering(offering.id),
    enabled: tab === 'plan' || tab === 'exams',
  });
  const timetable = useQuery({
    queryKey: ['timetable', 'offering', offering.id],
    queryFn: () => timetableApi.offering(offering.id),
  });
  const summary = useQuery({
    queryKey: ['reports', 'summary', { campusId: offering.campus.id }],
    queryFn: () => reportsApi.summary({ campusId: offering.campus.id }),
  });
  const filters = {
    campusId: offering.campus.id,
    offeringId: offering.id,
    deliveryStatus: 'ALL',
  };
  const reports = useQuery({
    queryKey: ['reports', filters],
    queryFn: () => reportsApi.read(filters),
    enabled: tab === 'lectures' || tab === 'exams',
  });
  const current =
    reports.data?.subjects.find((s) => s.id === offering.id) ??
    summary.data?.subjects.find((s) => s.id === offering.id);
  const identity = current ?? offering;
  const metrics = current?.metrics;
  const upcoming =
    timetable.data?.sessions.filter(
      (s) =>
        new Date(s.startsAt) > new Date() &&
        ['SCHEDULED', 'IN_PROGRESS'].includes(s.status),
    ) ?? [];
  const units = plan.data?.plan?.units ?? [];
  const tz = timetable.data?.semester.campus.timezone ?? 'Asia/Kolkata';
  return (
    <section className="subject-detail reports-workspace">
      <button className="subject-back" onClick={onBack}>
        ← All subjects
      </button>
      <header className="rp-header">
        <div>
          <p className="rp-eyebrow">
            {identity.subject.code} · {identity.track.name}
          </p>
          <h1>{identity.subject.name}</h1>
          <p>
            {identity.campus.name ? `${identity.campus.name} · ` : ''}
            {identity.semester.name} · {identity.batch.name}
          </p>
        </div>
        {current && <ReportBadge status={current.status} />}
      </header>
      <div className="subject-teacher-strip">
        <span>Assigned teacher</span>
        <strong>
          {identity.teachers.map((t) => t.name).join(', ') || 'Not assigned'}
        </strong>
        <span>
          {timetable.data
            ? `${reportNumber(timetable.data.summary.weeklyPlannedMinutes / 60)} h per week`
            : timetable.isError
              ? 'Assigned hours unavailable'
              : 'Loading assigned hours…'}
        </span>
      </div>
      {current ? (
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
      ) : summary.isPending ? (
        <LoadingSkeleton variant="cards" label="Loading subject progress" />
      ) : null}
      {current && (
        <BufferRatio
          metrics={metrics ? { ...metrics, status: current.status } : null}
        />
      )}
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
      {[
        tab === 'plan' || tab === 'exams' ? plan.error : null,
        timetable.error,
        summary.error,
        tab === 'lectures' || tab === 'exams' ? reports.error : null,
      ]
        .filter(Boolean)
        .map((e, i) => (
          <p role="alert" className="form-error" key={i}>
            {e?.message}
            <button
              onClick={() => {
                void summary.refetch();
                void timetable.refetch();
                if (tab === 'plan' || tab === 'exams') void plan.refetch();
                if (tab === 'lectures' || tab === 'exams')
                  void reports.refetch();
              }}
            >
              Retry subject data
            </button>
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
              <p>
                {current?.reason ??
                  (summary.isPending
                    ? 'Loading current progress…'
                    : 'Refresh progress to see the latest figures.')}
              </p>
              <dl>
                <dt>Next topic</dt>
                <dd>
                  {current
                    ? current.nextTopic || 'No upcoming topic scheduled'
                    : summary.isError
                      ? 'Unavailable'
                      : 'Loading…'}
                </dd>
                <dt>Teaching plan</dt>
                <dd>
                  {current?.planStatus
                    ? `Version ${current.planVersion} · ${current.planStatus.toLowerCase()}`
                    : summary.isPending
                      ? 'Loading…'
                      : summary.isError
                        ? 'Plan information unavailable'
                        : 'No plan uploaded for this offering'}
                </dd>
                <dt>Saved lecture logs</dt>
                <dd>
                  {current?.logged ??
                    (summary.isError ? 'Unavailable' : 'Loading…')}
                </dd>
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
                    : timetable.isError
                      ? 'Class dates could not be loaded.'
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
                  <p className="rp-empty">
                    {timetable.isPending
                      ? 'Loading classes…'
                      : timetable.isError
                        ? 'Class dates could not be loaded.'
                        : 'No upcoming lectures.'}
                  </p>
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
              ) : reports.isError ? (
                <p className="rp-empty">
                  Report records could not be loaded. Use Retry subject data
                  above.
                </p>
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
                    : plan.isPending
                      ? 'Loading teaching plan…'
                      : plan.isError
                        ? 'Teaching plan could not be loaded.'
                        : 'No lesson plan uploaded.'}
                </p>
              </div>
            </div>
            {plan.isPending && (
              <LoadingSkeleton label="Loading teaching plan" />
            )}
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
              ) : reports.isError ? (
                <p className="rp-empty">
                  Report records could not be loaded. Use Retry subject data
                  above.
                </p>
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
