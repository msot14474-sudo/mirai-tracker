import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicApi } from './academic';
import { LoadingSkeleton } from './LoadingSkeleton';

/** Read-only view of the same campus records maintained by the program manager. */
export function CampusAcademicOverview() {
  const [chosenCampus, setCampus] = useState('');
  const [chosenSemester, setSemester] = useState('');
  const refresh = { staleTime: 0, refetchInterval: 15000, refetchOnWindowFocus: 'always' as const };
  const campuses = useQuery({ queryKey: ['academic', 'campuses'], queryFn: academicApi.campuses, ...refresh });
  const campusId = chosenCampus || campuses.data?.[0]?.id || '';
  const semesters = useQuery({ queryKey: ['academic', 'semesters', campusId], queryFn: () => academicApi.semesters(campusId), enabled: !!campusId, ...refresh });
  const subjects = useQuery({ queryKey: ['academic', 'subjects', campusId], queryFn: () => academicApi.subjects(campusId), enabled: !!campusId, ...refresh });
  const semesterId = semesters.data?.find(s => s.id === chosenSemester)?.id || semesters.data?.[0]?.id || '';
  const calendar = useQuery({ queryKey: ['academic', 'calendar', semesterId], queryFn: () => academicApi.calendar(semesterId), enabled: !!semesterId, ...refresh });
  const batches = useQuery({ queryKey: ['academic', 'semester-subjects', semesterId], queryFn: () => academicApi.semesterCourses(semesterId), enabled: !!semesterId, ...refresh });
  const loading = campuses.isPending || semesters.isLoading || subjects.isLoading;
  return <section className="panel campus-academic-overview">
    <header><h2>Campus semesters and subjects</h2><p>Shared semester dates, calendar and subjects maintained by your program manager.</p></header>
    <div className="form-grid campus-academic-filters">
      <label>Campus<select value={campusId} disabled={campuses.isPending} onChange={e => { setCampus(e.target.value); setSemester(''); }}>{!campusId && <option value="">{campuses.isPending ? 'Loading campuses…' : 'No campus available'}</option>}{campuses.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Semester<select value={semesterId} disabled={!campusId || semesters.isLoading} onChange={e => setSemester(e.target.value)}>{!semesterId && <option value="">{semesters.isLoading ? 'Loading semesters…' : 'No semesters yet'}</option>}{semesters.data?.map(s => <option key={s.id} value={s.id}>{s.name} · {s.startDate.slice(0,10)} – {s.endDate.slice(0,10)}</option>)}</select></label>
    </div>
    {[campuses, semesters, subjects, calendar, batches].map((q, i) => q.isError ? <p className="form-error" role="alert" key={i}>{q.error.message}</p> : null)}
    {loading ? <LoadingSkeleton variant="cards" label="Loading campus records" /> : <>
      {semesters.isSuccess && !semesters.data.length && <div className="empty-state"><h3>No semesters yet</h3><p>No semesters have been created for this campus yet.</p></div>}
      {subjects.isSuccess && <section className="campus-academic-section"><h3>Campus subjects ({subjects.data.length})</h3>
      {!subjects.data.length ? <p className="empty-copy">No subjects have been created for this campus yet.</p> : <div className="campus-subject-grid">{subjects.data.map(s => <article className="faculty-subject-card" key={s.id}><h3>{s.name}</h3><p>{s.code} · {s.teachers?.map(t => t.staffProfile.user.name).join(', ') || 'Teacher not assigned'}</p>
        {s.offerings?.length ? <ul>{s.offerings.map(o => <li key={o.id}>{o.batch.semester.name} · {o.batch.name}{o.faculty.length ? ` · ${o.faculty.map(f => f.staffProfile.user.name).join(', ')}` : ' · Teacher not assigned'}</li>)}</ul> : <p>Created in the campus catalog. The program manager must link it to a semester batch before you can schedule classes.</p>}
      </article>)}</div>}</section>}
    </>}
    {calendar.isLoading ? <LoadingSkeleton variant="table" label="Loading semester calendar" /> : calendar.data && <section className="campus-academic-section">
      <div className="subheading-row"><h3>Semester calendar</h3>{batches.data && <span>{batches.data.length} batches linked to the selected semester.</span>}</div>
      <div className="calendar-summary"><div><span>Total dates</span><strong>{calendar.data.summary.totalDays}</strong></div><div><span>Teaching days</span><strong>{calendar.data.summary.workingDays}</strong></div><div><span>Non-teaching</span><strong>{calendar.data.summary.nonWorkingDays}</strong></div></div>
      <div className="table-scroll campus-calendar-scroll" tabIndex={0} role="region" aria-label="Semester calendar"><table><thead><tr><th>Date</th><th>Day</th><th>Calendar</th><th>Status</th></tr></thead><tbody>{calendar.data.days.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.weekday}</td><td>{d.override?.title || d.reason.replaceAll('_', ' ').toLowerCase()}</td><td><span className={`day-state ${d.working ? 'working' : 'closed'}`}>{d.working ? 'Teaching' : 'Closed'}</span></td></tr>)}</tbody></table></div>
      <h3>Exam windows</h3>{calendar.data.exams.length ? <ul>{calendar.data.exams.map(e => <li key={e.id}>{e.name} · {e.startDate.slice(0,10)} – {e.endDate.slice(0,10)}</li>)}</ul> : <p className="empty-copy">No exam windows have been added to this semester yet.</p>}
    </section>}
  </section>;
}
