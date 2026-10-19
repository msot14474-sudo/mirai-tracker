import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicApi } from './academic';

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
  return <section className="panel"><h2>Campus semesters and subjects</h2>
    <p>Shared semester dates, calendar and subjects maintained by your program manager.</p>
    <label>Campus<select value={campusId} onChange={e => { setCampus(e.target.value); setSemester(''); }}>{campuses.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {[campuses, semesters, subjects, calendar, batches].map((q, i) => q.isError ? <p role="alert" key={i}>{q.error.message}</p> : null)}
    <label>Semester<select value={semesterId} onChange={e => setSemester(e.target.value)}>{semesters.data?.map(s => <option key={s.id} value={s.id}>{s.name} · {s.startDate.slice(0,10)} – {s.endDate.slice(0,10)}</option>)}</select></label>
    {semesters.isSuccess && !semesters.data.length && <p>No semesters have been created for this campus yet.</p>}
    <h3>Campus subjects ({subjects.data?.length ?? 0})</h3>
    {subjects.data?.map(s => <article className="import-card" key={s.id}><h4>{s.name} · {s.code}</h4><p>{s.teachers?.map(t => t.staffProfile.user.name).join(', ') || 'Teacher not assigned'}</p>
      {s.offerings?.length ? <ul>{s.offerings.map(o => <li key={o.id}>{o.batch.semester.name} · {o.batch.name}{o.faculty.length ? ` · ${o.faculty.map(f => f.staffProfile.user.name).join(', ')}` : ' · Teacher not assigned'}</li>)}</ul> : <p>Created in the campus catalog. The program manager must link it to a semester batch before you can schedule classes.</p>}
    </article>)}
    {batches.data && <p>{batches.data.length} batches linked to the selected semester.</p>}
    {calendar.data && <><h3>Semester calendar</h3><div style={{maxHeight: 360, overflow: 'auto'}} tabIndex={0} aria-label="Semester calendar"><table><thead><tr><th>Date</th><th>Day</th><th>Calendar</th></tr></thead><tbody>{calendar.data.days.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.weekday}</td><td>{d.override?.title || d.reason} · {d.working ? 'Teaching' : 'Closed'}</td></tr>)}</tbody></table></div><h3>Exam windows</h3><ul>{calendar.data.exams.map(e => <li key={e.id}>{e.name} · {e.startDate.slice(0,10)} – {e.endDate.slice(0,10)}</li>)}</ul></>}
  </section>;
}
