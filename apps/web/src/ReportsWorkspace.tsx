import { academicTracks } from './tracks';
import { BufferRatioValue, BufferRatioLegend } from './BufferRatio';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { LoadingSkeleton } from './LoadingSkeleton';
import { saveDownload } from './exports';
import {
  CourseReport,
  ReportBase,
  ReportFilters,
  ReportsData,
  ReportStatus,
  ReportTab,
  reportsApi,
  reportDate,
  reportNumber as num,
  statusLabel,
} from './reports';
import './reports.css';
import './ResponsiveRecords.css';

export const reportTabs: {
  id: ReportTab;
  label: string;
  description: string;
}[] = [
  {
    id: 'course',
    label: 'Course Progress',
    description:
      'Recorded syllabus coverage, teaching capacity and pace against the current plan.',
  },
  {
    id: 'delivery',
    label: 'Teaching Delivery',
    description:
      'Saved lecture logs, what was covered, and work carried forward.',
  },
  {
    id: 'faculty',
    label: 'Faculty Activity',
    description:
      'Lesson-plan uploads and the latest saved log for each class, attributed to its author.',
  },
  {
    id: 'exams',
    label: 'Exam Readiness',
    description:
      'Upcoming and ongoing exams, syllabus coverage and teaching time before each deadline.',
  },
  {
    id: 'campus',
    label: 'Campus & Track',
    description:
      'Campus and track progress. The worst subject determines status, never an average.',
  },
];
export function ReportBadge({ status }: { status: string }) {
  return (
    <span className={`rp-badge rp-${status.toLowerCase()}`}>
      {statusLabel(status)}
    </span>
  );
}
export function ReportKpis({
  items,
}: {
  items: { label: string; value: ReactNode; note: string }[];
}) {
  return (
    <div className="rp-kpis">
      {items.map((i) => (
        <div key={i.label}>
          <span>{i.label}</span>
          <strong>{i.value}</strong>
          <small>{i.note}</small>
        </div>
      ))}
    </div>
  );
}
function SubjectCell({ row }: { row: ReportBase }) {
  return (
    <div className="rp-subject-cell">
      <strong>{row.subject.name}</strong>
      <small>
        {row.subject.code} · {row.campus.name}
      </small>
      <small>Track: {row.track.name}</small>
    </div>
  );
}
function Teachers({ row }: { row: ReportBase }) {
  return (
    <span>{row.teachers.map((t) => t.name).join(', ') || 'Not assigned'}</span>
  );
}
function Coverage({ value }: { value: number | null | undefined }) {
  return (
    <div className="rp-coverage">
      <strong>{num(value, '%')}</strong>
      {value != null ? (
        <progress value={value} max={100} aria-label="Recorded coverage" />
      ) : (
        <small>Needs data</small>
      )}
    </div>
  );
}
function ReportTable({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: { id: string; cells: ReactNode[] }[];
  caption: string;
}) {
  const [page, setPage] = useState(0);
  const size = 25,
    pages = Math.ceil(rows.length / size),
    current = Math.min(page, Math.max(0, pages - 1));
  if (!rows.length)
    return (
      <div className="rp-empty">
        <strong>No matching records</strong>
        <p>
          {caption === 'Teaching Delivery'
            ? 'Scheduled classes appear here only after a lecture log is saved. Try another status or date filter.'
            : 'No records match these filters. Try another selection.'}
        </p>
      </div>
    );
  return (
    <>
      <div
        className="rp-table-scroll responsive-records"
        tabIndex={0}
        role="region"
        aria-label={`${caption} table`}
      >
        <table role="table">
          <caption>{caption}</caption>
          <thead role="rowgroup">
            <tr role="row">
              {headers.map((h) => (
                <th key={h} scope="col" role="columnheader">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.slice(current * size, (current + 1) * size).map((r) => (
              <tr key={r.id} role="row">
                {r.cells.map((cell, i) => (
                  <td key={headers[i]} role="cell" data-label={headers[i]}>
                    <span className="record-field-label" aria-hidden="true">
                      {headers[i]}
                    </span>
                    <div className="record-field-value">{cell}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rp-pagination">
        <span>
          {current * size + 1}–{Math.min((current + 1) * size, rows.length)} of{' '}
          {rows.length} records
        </span>
        {pages > 1 ? (
          <div>
            <button
              type="button"
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
function Detail({
  children,
  label = 'Details',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="rp-details">
      <summary>{label}</summary>
      {children}
    </details>
  );
}
export function ReportContent({
  tab,
  data,
}: {
  tab: ReportTab;
  data: ReportsData;
}) {
  let headers: string[], rows: { id: string; cells: ReactNode[] }[];
  if (tab === 'exams') {
    headers = [
      'Exam',
      'Subject',
      'Batch',
      'Faculty',
      'Readiness Status',
      'Coverage',
      'Syllabus Left',
      'Teaching Left',
      'Buffer Ratio',
      'Scope Mode',
    ];
    rows = data.exams.map((r) => ({
      id: r.id,
      cells: [
        <div>
          <strong>{r.exam}</strong>
          <small>{reportDate(r.date)}</small>
          <small>Deadline {reportDate(r.deadline)}</small>
        </div>,
        <SubjectCell row={r} />,
        r.batch.name,
        <Teachers row={r} />,
        <div>
          <ReportBadge status={r.status} />
          <Detail label="Why this status?">
            <p>{r.reason}</p>
            <BufferRatioLegend thresholds={r.thresholds} />
          </Detail>
        </div>,
        <Coverage value={r.coverage} />,
        num(r.remainingHours, ' h'),
        num(r.teachingHours, ' h'),
        <BufferRatioValue
          metrics={
            r.remainingHours == null
              ? null
              : {
                  ...r,
                  availableHours: r.teachingHours,
                  remainingHours: r.remainingHours,
                }
          }
        />,
        <div>
          {r.scopeMode}
          <small>{r.scopeTopics} topics in scope</small>
        </div>,
      ],
    }));
  } else if (tab === 'delivery') {
    headers = [
      'Class',
      'Subject',
      'Batch',
      'Logged by',
      'Delivery Status',
      'Scheduled Hours',
      'Topic Hours Recorded',
      'Completion',
      'Teaching Record',
    ];
    rows = data.delivery.map((r) => ({
      id: r.id,
      cells: [
        <div>
          <strong>{reportDate(r.date)}</strong>
          <small>
            {new Date(r.startsAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: r.timezone,
            })}{' '}
            –{' '}
            {new Date(r.endsAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: r.timezone,
            })}
          </small>
          <small>{r.timezone}</small>
        </div>,
        <SubjectCell row={r} />,
        r.batch.name,
        r.teacher.name,
        <ReportBadge status={r.status} />,
        num(r.scheduledHours, ' h'),
        num(r.recordedTopicHours, ' h'),
        num(r.completion, '%'),
        <div className="rp-log-summary">
          <p>{r.covered || 'No coverage text recorded'}</p>
          <Detail label="View full log">
            <dl>
              <dt>Left over</dt>
              <dd>{r.leftOver || 'None recorded'}</dd>
              <dt>Carry forward</dt>
              <dd>{r.carryForward || 'None recorded'}</dd>
              <dt>Classwork</dt>
              <dd>{statusLabel(r.classwork)}</dd>
              <dt>Homework</dt>
              <dd>{statusLabel(r.homework)}</dd>
              <dt>Notes</dt>
              <dd>{r.notes || 'None recorded'}</dd>
              <dt>Log revision</dt>
              <dd>
                {r.revision} · saved {new Date(r.loggedAt).toLocaleString()}
              </dd>
            </dl>
          </Detail>
        </div>,
      ],
    }));
  } else if (tab === 'faculty') {
    headers = [
      'Faculty',
      'Assigned Subjects / Recorded Work',
      'Sessions Logged',
      'Classes Recorded as Taught',
      'Scheduled Teaching Hours',
      'Plans Uploaded',
      'Last Activity',
      'Activity',
    ];
    rows = data.faculty.map((r) => ({
      id: r.id,
      cells: [
        <strong>{r.name}</strong>,
        <ul className="rp-subject-list">
          {r.subjects.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>,
        r.sessionsLogged,
        r.classesTaught,
        num(r.scheduledHours, ' h'),
        r.plansUploaded,
        r.lastActivity
          ? new Date(r.lastActivity).toLocaleString()
          : 'No activity recorded',
        <Detail label={`View activity (${r.recent.length})`}>
          <ol className="rp-timeline">
            {r.recent.map((a, i) => (
              <li key={i}>
                <strong>{a.action}</strong>
                <span>{a.subject}</span>
                <small>{new Date(a.date).toLocaleString()}</small>
              </li>
            ))}
          </ol>
          {!r.recent.length ? (
            <p>No saved logs or plan uploads for this period.</p>
          ) : null}
        </Detail>,
      ],
    }));
  } else if (tab === 'campus') {
    headers = [
      'Campus / Track',
      'Subjects',
      'Status',
      'Coverage',
      'Planned Hours',
      'Covered Hours',
      'Remaining Hours',
      'Teaching Left',
      'Buffer Ratio',
      'Needs Data',
      'Worst Subject',
    ];
    rows = data.groups.map((r) => ({
      id: `${r.kind}:${r.id}`,
      cells: [
        <div>
          <strong>{r.name}</strong>
          <small>
            {r.kind === 'campus' ? 'Campus' : `Track · ${r.campus}`}
          </small>
        </div>,
        r.subjectCount,
        <ReportBadge status={r.status} />,
        <Coverage value={r.metrics?.coveragePercentage} />,
        num(r.metrics?.hoursInScope, ' h'),
        num(r.metrics?.coveredHours, ' h'),
        num(r.metrics?.remainingHours, ' h'),
        num(r.metrics?.availableHours, ' h'),
        <BufferRatioValue
          metrics={r.metrics ? { ...r.metrics, status: r.status } : null}
        />,
        r.needsData,
        r.worstSubject,
      ],
    }));
  } else {
    headers = [
      'Subject',
      'Batch / Semester',
      'Faculty',
      'Status',
      'Coverage',
      'Planned Hours',
      'Covered Hours',
      'Behind Plan',
      'Syllabus Left',
      'Teaching Left',
      'Buffer Ratio',
      'Deadline',
    ];
    rows = data.subjects.map((r) => ({
      id: r.id,
      cells: [
        <SubjectCell row={r} />,
        <div>
          {r.batch.name}
          <small>{r.semester.name}</small>
        </div>,
        <Teachers row={r} />,
        <div>
          <ReportBadge status={r.status} />
          <Detail label="Why this status?">
            <p>{r.reason}</p>
            <BufferRatioLegend thresholds={r.metrics?.thresholds} />
            <p>
              {r.logged} classes have logs; {r.unlogged} past classes have none.
            </p>
            <p>
              {r.planStatus
                ? `Plan v${r.planVersion} · ${statusLabel(r.planStatus)}`
                : 'No lesson plan'}
            </p>
          </Detail>
        </div>,
        <Coverage value={r.metrics?.coveragePercentage} />,
        num(r.metrics?.hoursInScope, ' h'),
        num(r.metrics?.coveredHours, ' h'),
        num(r.metrics ? Math.max(0, -r.metrics.paceVsPlanHours) : null, ' h'),
        num(r.metrics?.remainingHours, ' h'),
        num(r.metrics?.availableHours, ' h'),
        <BufferRatioValue
          metrics={r.metrics ? { ...r.metrics, status: r.status } : null}
        />,
        reportDate(r.deadline),
      ],
    }));
  }
  return (
    <ReportTable
      key={tab}
      headers={headers}
      rows={rows}
      caption={reportTabs.find((t) => t.id === tab)!.label}
    />
  );
}
function metricsFor(tab: ReportTab, data: ReportsData) {
  const s = data.summary;
  if (tab === 'exams')
    return [
      {
        label: 'Upcoming / ongoing exams',
        value: new Set(data.exams.map((e) => e.examId)).size,
        note: 'Within the selected date range',
      },
      {
        label: 'Assessed subjects',
        value: data.exams.filter((e) => e.scopeMode === 'Assessed').length,
        note: 'Subject–exam combinations',
      },
      {
        label: 'At risk',
        value: data.exams.filter((e) => ['DANGER', 'TIGHT'].includes(e.status))
          .length,
        note: 'Insufficient or tight teaching capacity',
      },
      {
        label: 'Needs data',
        value: data.exams.filter((e) => e.status === 'NEEDS_DATA').length,
        note: 'Missing scope, plan or timetable',
      },
    ];
  if (tab === 'delivery')
    return [
      {
        label: 'Matching session logs',
        value: data.delivery.length,
        note: 'Latest saved revision per class',
      },
      {
        label: 'Recorded as taught',
        value: data.delivery.filter((r) =>
          ['COMPLETED', 'IN_PROGRESS'].includes(r.status),
        ).length,
        note: 'Completed or in progress',
      },
      {
        label: 'Scheduled hours',
        value: num(
          data.delivery.reduce((n, r) => n + r.scheduledHours, 0),
          ' h',
        ),
        note: 'Class duration, not measured teaching time',
      },
      {
        label: 'With leftover work',
        value: data.delivery.filter((r) => r.leftOver).length,
        note: 'Follow-up recorded by faculty',
      },
    ];
  if (tab === 'faculty')
    return [
      {
        label: 'Faculty',
        value: data.faculty.length,
        note: data.facultyOnly
          ? 'Your own activity'
          : 'Faculty you can manage',
      },
      {
        label: 'Sessions logged',
        value: data.faculty.reduce((n, r) => n + r.sessionsLogged, 0),
        note: 'Each class log is counted once',
      },
      {
        label: 'Plans uploaded',
        value: data.faculty.reduce((n, r) => n + r.plansUploaded, 0),
        note: 'Includes archived plan versions',
      },
      {
        label: 'Recorded teaching',
        value: num(
          data.faculty.reduce((n, r) => n + r.scheduledHours, 0),
          ' h',
        ),
        note: 'Scheduled duration of logged teaching',
      },
    ];
  return [
    {
      label: 'Subject offerings',
      value: s.subjects,
      note: `${s.assessed} assessed · ${s.needsData} need data`,
    },
    {
      label: 'Recorded coverage',
      value: num(s.metrics?.coveragePercentage, '%'),
      note: 'Weighted by known lesson-plan hours',
    },
    {
      label: 'Behind plan',
      value: num(s.metrics ? s.behindHours : null, ' h'),
      note: 'Sum of each subject’s recorded shortfall',
    },
    {
      label: 'Subjects at risk',
      value: s.atRisk,
      note: 'Tight or danger; missing data is separate',
    },
  ];
}
export function ReportsWorkspace({
  campusId,
  initialTab = 'course',
  initialSubjectId,
  mode = 'reports',
  facultyOnly: facultyRole = false,
}: {
  facultyOnly?: boolean;
  mode?: 'reports' | 'progress';
  campusId?: string;
  initialTab?: ReportTab;
  initialSubjectId?: string;
}) {
  const [filters, setFilters] = useState<ReportFilters>({
    campusId,
    subjectId: initialSubjectId,
    tab:
      mode === 'progress' ||
      (facultyRole && !['course', 'delivery'].includes(initialTab))
        ? 'course'
        : initialTab,
    deliveryStatus: 'TAUGHT',
  });
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState('');
  const selectedTab = filters.tab ?? 'course';
  const dateError = Boolean(
    filters.from && filters.to && filters.from > filters.to,
  );
  const { tab: _tab, ...queryFilters } = filters;
  const compact = ['course', 'campus'].includes(selectedTab);
  const { deliveryStatus: _deliveryStatus, ...summaryFilters } = queryFilters;
  const query = useQuery({
    queryKey: compact
      ? ['reports', 'summary', summaryFilters]
      : ['reports', queryFilters],
    queryFn: () =>
      compact
        ? reportsApi.summary(summaryFilters)
        : reportsApi.read(queryFilters),
    enabled: !dateError,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const facultyOnly = facultyRole || Boolean(data?.facultyOnly);
  const tab =
    facultyOnly && !['course', 'delivery'].includes(selectedTab)
      ? 'course'
      : selectedTab;
  const tabLabel = (id: ReportTab) =>
    facultyOnly
      ? id === 'delivery'
        ? 'My Teaching'
        : 'My Subjects'
      : reportTabs.find((t) => t.id === id)!.label;
  const options = data?.options ?? [];
  function update(key: keyof ReportFilters, value: string) {
    setFilters((f) => ({
      ...f,
      [key]: value || undefined,
      ...(['campusId', 'semesterId'].includes(key)
        ? { batchId: undefined, subjectId: undefined, facultyId: undefined }
        : {}),
      ...(key === 'campusId'
        ? { trackId: undefined, semesterId: undefined }
        : {}),
      ...(['batchId', 'semesterId'].includes(key)
        ? { trackId: undefined }
        : {}),
      ...(['batchId', 'trackId'].includes(key)
        ? { subjectId: undefined, facultyId: undefined }
        : {}),
    }));
    setExportError('');
  }
  function values(
    key: 'campus' | 'track' | 'semester' | 'batch' | 'subject' | 'teachers',
  ) {
    if (key === 'campus' && data?.availableCampuses)
      return data.availableCampuses;
    if (key === 'track') return academicTracks;
    const activeCampus =
      filters.campusId ?? (facultyOnly ? data?.activeCampusId : undefined);
    const level = [
      'campus',
      'semester',
      'batch',
      'track',
      'subject',
      'teachers',
    ].indexOf(key);
    const filtered = options.filter(
      (o) =>
        (level <= 0 || !activeCampus || o.campus.id === activeCampus) &&
        (level <= 1 ||
          !filters.semesterId ||
          o.semester.id === filters.semesterId) &&
        (level <= 2 || !filters.batchId || o.batch.id === filters.batchId) &&
        (level <= 3 || !filters.trackId || o.track.id === filters.trackId) &&
        (level <= 4 ||
          !filters.subjectId ||
          o.subject.id === filters.subjectId),
    );
    return [
      ...new Map(
        filtered
          .flatMap((o) => (key === 'teachers' ? o.teachers : [o[key]]))
          .map((v) => [v.id, v]),
      ).values(),
    ]
      .filter((v) => key !== 'teachers' || !data?.facultyOnly)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async function exportDocument() {
    setExporting(true);
    setExportError('');
    try {
      const file = await reportsApi.document({
        ...filters,
        tab,
        ...(facultyOnly
          ? {
              campusId: data?.activeCampusId ?? filters.campusId,
              facultyId: undefined,
            }
          : {}),
      });
      saveDownload(file.blob, file.filename);
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : 'Could not export this report.',
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <section
      className={`reports-workspace ${mode === 'progress' ? 'progress-workspace' : ''}`}
      aria-label={mode === 'progress' ? 'Progress' : 'Reports'}
    >
      <header className="rp-header">
        <div>
          <p className="rp-eyebrow">Academic intelligence</p>
          <h1>
            {mode === 'progress'
              ? 'Campus progress'
              : facultyOnly
                ? 'My reports'
                : 'Reports'}
          </h1>
          <p>
            {mode === 'progress'
              ? `${values('campus').find((c) => c.id === filters.campusId)?.name ?? 'Your permitted campuses'} · Compare syllabus coverage, teaching hours and subjects that need attention.`
              : facultyOnly
                ? 'Progress for your assigned subjects and your own recorded teaching.'
                : 'Course progress, teaching records and exam readiness in one place.'}
          </p>
        </div>
        <button
          className="rp-primary"
          type="button"
          disabled={!data || query.isPlaceholderData || dateError || exporting}
          onClick={() => void exportDocument()}
        >
          {exporting ? 'Preparing analysis…' : 'Generate analysis report'}
        </button>
      </header>
      {mode === 'reports' && (
        <div
          className="rp-tabbar"
          role="tablist"
          aria-label="Report categories"
        >
          {reportTabs
            .filter(
              (t) => !facultyOnly || ['course', 'delivery'].includes(t.id),
            )
            .map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`report-tab-${t.id}`}
                aria-controls="report-panel"
                aria-selected={tab === t.id}
                onClick={() => update('tab', t.id)}
              >
                {tabLabel(t.id)}
              </button>
            ))}
        </div>
      )}
      <section className="rp-filters" aria-label="Report filters">
        <div className="rp-section-heading">
          <div>
            <h2>
              {mode === 'progress' ? 'Choose what to review' : 'Report filters'}
            </h2>
            <p>
              {facultyOnly
                ? 'Review and download reports for your assigned subjects.'
                : 'Choose a campus, subject or date range.'}
            </p>
          </div>
          <button
            type="button"
            className="rp-text-button"
            onClick={() => {
              setFilters({
                tab,
                campusId: facultyOnly
                  ? (data?.activeCampusId ?? undefined)
                  : campusId,
                deliveryStatus: 'TAUGHT',
              });
              setExportError('');
            }}
          >
            Reset filters
          </button>
        </div>
        <div className="rp-filter-grid">
          {facultyOnly && values('campus').length <= 1 ? (
            <div className="rp-fixed-field">
              <span>Your campus</span>
              <strong>
                {values('campus')[0]?.name ?? 'Your assigned campus'}
              </strong>
            </div>
          ) : null}
          {(
            [
              ...(!facultyOnly || values('campus').length > 1
                ? [['campusId', 'Campus', 'campus', 'All permitted campuses']]
                : []),
              ['semesterId', 'Semester', 'semester', 'All semesters'],
              ['batchId', 'Batch', 'batch', 'All batches'],
              ['trackId', 'Track', 'track', 'All tracks'],
              ['subjectId', 'Subject', 'subject', 'All subjects'],
              ...(!facultyOnly
                ? [['facultyId', 'Faculty', 'teachers', 'All faculty']]
                : []),
            ] as const
          ).map(([field, label, key, all]) => (
            <label key={field}>
              {label}
              <select
                aria-label={label}
                value={
                  (field === 'campusId' && facultyOnly
                    ? data?.activeCampusId
                    : filters[field as keyof ReportFilters]) ?? ''
                }
                onChange={(e) =>
                  update(field as keyof ReportFilters, e.target.value)
                }
              >
                {!(field === 'campusId' && facultyOnly) && (
                  <option value="">
                    {field === 'subjectId' && facultyOnly
                      ? 'All my subjects'
                      : all}
                  </option>
                )}
                {values(key as 'campus').map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {mode === 'reports' && (
            <>
              <label>
                From date
                <input
                  aria-label="From date"
                  type="date"
                  value={filters.from ?? ''}
                  onChange={(e) => update('from', e.target.value)}
                />
              </label>
              <label>
                To date
                <input
                  aria-label="To date"
                  type="date"
                  value={filters.to ?? ''}
                  min={filters.from}
                  onChange={(e) => update('to', e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <p className="rp-filter-note">
          {mode === 'progress'
            ? 'Progress uses saved lesson plans and class logs. Available hours come from upcoming classes.'
            : facultyOnly
              ? 'Dates filter class records. Coverage is current; available hours count upcoming classes.'
              : 'Dates filter classes, faculty activity and exams. Coverage is current; available hours count upcoming classes.'}
        </p>
        {dateError ? (
          <p role="alert" className="form-error">
            From date must be on or before To date.
          </p>
        ) : null}
      </section>
      {exporting && (
        <p role="status" className="rp-filter-note">
          Preparing your report with charts, saved records and AI analysis. The
          downloaded document opens in your browser and can be printed to PDF.
        </p>
      )}
      {exportError ? (
        <p role="alert" className="form-error">
          {exportError}
        </p>
      ) : null}
      {query.isError && !data ? (
        <div role="alert" className="rp-empty">
          <p>{query.error.message}</p>
          <button type="button" onClick={() => void query.refetch()}>
            Retry reports
          </button>
        </div>
      ) : query.isPending || query.isPlaceholderData ? (
        <LoadingSkeleton variant="cards" label="Loading report records" />
      ) : data && !dateError ? (
        <div
          className="rp-panel"
          id="report-panel"
          role={mode === 'reports' ? 'tabpanel' : 'region'}
          aria-label={
            mode === 'progress' ? 'Current campus progress' : undefined
          }
          aria-labelledby={mode === 'reports' ? `report-tab-${tab}` : undefined}
        >
          <ReportKpis items={metricsFor(tab, data)} />
          {mode === 'progress' && (
            <div className="progress-scope-summary">
              <div>
                <span>Overall status</span>
                <ReportBadge status={data.summary.status} />
                <p>
                  {data.summary.worstSubject
                    ? `Priority subject: ${data.summary.worstSubject}`
                    : 'Add lesson plans and class logs to assess progress.'}
                </p>
              </div>
              <div>
                <span>Teaching record</span>
                <strong>
                  {data.summary.logged} logged · {data.summary.unlogged}{' '}
                  awaiting logs
                </strong>
                <p>
                  {data.summary.upcoming} upcoming classes in this selection.
                </p>
              </div>
              <div>
                <span>Next exam</span>
                <strong>
                  {data.summary.nextExam?.name ?? 'No upcoming exam'}
                </strong>
                <p>
                  {data.summary.nextExam
                    ? `${reportDate(data.summary.nextExam.date)} · ${data.summary.nextExam.campus}`
                    : 'Exam dates appear after the semester calendar is set.'}
                </p>
              </div>
            </div>
          )}

          <section className="rp-results">
            <div className="rp-section-heading">
              <div>
                <h2>{tabLabel(tab)}</h2>
                <p>
                  {facultyOnly && tab === 'delivery'
                    ? 'Your saved class logs for your assigned subjects, including covered and remaining work.'
                    : reportTabs.find((t) => t.id === tab)!.description}
                </p>
              </div>
              {tab === 'delivery' ? (
                <label>
                  Show
                  <select
                    aria-label="Delivery status"
                    value={filters.deliveryStatus ?? 'TAUGHT'}
                    onChange={(e) => update('deliveryStatus', e.target.value)}
                  >
                    <option value="TAUGHT">Taught classes</option>
                    <option value="ALL">All logged statuses</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="SKIPPED">Skipped</option>
                    <option value="MERGED">Merged</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
              ) : null}
            </div>
            <ReportContent tab={tab} data={data} />
          </section>
          <footer className="rp-footnote">
            Updated {new Date(data.generatedAt).toLocaleString()} · Coverage is
            recorded progress. Missing logs do not prove that teaching was
            missed. Combined buffer ratios use total available hours ÷ total
            remaining hours. Campus and track status still follow the worst
            subject.
            <BufferRatioLegend />
          </footer>
        </div>
      ) : null}
    </section>
  );
}
