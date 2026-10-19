import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicApi } from './academic';
export function SemesterSubjects({ semesterId, campusId }: { semesterId: string; campusId: string }) {
  const client = useQueryClient();
  const [batchId, setBatch] = useState('');
  const batches = useQuery({ queryKey: ['academic', 'semester-subjects', semesterId], queryFn: () => academicApi.semesterCourses(semesterId) });
  const subjects = useQuery({ queryKey: ['academic', 'subjects', campusId], queryFn: () => academicApi.subjects(campusId) });
  const save = useMutation({ mutationFn: (data: Parameters<typeof academicApi.connectSubjects>[1]) => academicApi.connectSubjects(semesterId, data), onSuccess: async () => { await client.invalidateQueries(); } });
  return <section className="import-card" aria-labelledby="semester-subjects-heading">
    <h3 id="semester-subjects-heading">Subjects and batches in this semester</h3>
    <p>Link subjects to a batch here. The campus manager can then assign teachers and build their timetable.</p>
    {batches.isError && <p role="alert">{batches.error.message}</p>}
    {batches.data?.map(batch => <article key={batch.id}>
      <h4>{batch.name} · {batch.track.name}</h4>
      <ul>{batch.subjectOfferings.map(o => <li key={o.id}>{o.subject.name} — {o.faculty.length ? o.faculty.map(f => f.staffProfile.user.name).join(', ') : 'Teacher not assigned'}</li>)}</ul>
    </article>)}
    <form onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      save.mutate({ ...(batchId ? { batchId } : { batchName: String(data.get('batchName')), batchCode: String(data.get('batchCode')), trackName: String(data.get('trackName')), trackCode: String(data.get('trackCode')) }), subjectIds: data.getAll('subjectIds').map(String) });
    }}>
      <label>Batch<select value={batchId} onChange={e => { setBatch(e.target.value); save.reset(); }}><option value="">Create a new batch</option>{batches.data?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {!batchId && <div className="form-grid">
        <label>Batch name<input name="batchName" required maxLength={160} placeholder="e.g. First year A" /></label>
        <label>Batch code<input name="batchCode" required maxLength={64} placeholder="e.g. YEAR1-A" /></label>
        <label>Track name<input name="trackName" required maxLength={160} placeholder="e.g. Mirai Track" /></label>
        <label>Track code<input name="trackCode" required maxLength={32} placeholder="e.g. MIRAI" /></label>
      </div>}
      <fieldset><legend>Select subjects for this batch</legend>
        {subjects.isError && <p role="alert">{subjects.error.message}</p>}
        {subjects.data?.map(subject => <label key={subject.id}><input type="checkbox" name="subjectIds" value={subject.id} /> {subject.name}</label>)}
        {subjects.isSuccess && !subjects.data.length && <p>Add subjects in the Subjects tab first, then return to this semester.</p>}
      </fieldset>
      <button type="submit" disabled={save.isPending || !subjects.data?.length || batches.isPending || batches.isError}>{save.isPending ? 'Saving…' : 'Save batch and subjects'}</button>
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Subjects linked. They are now available for campus teacher assignments and timetable setup.</p>}
    </form>
  </section>;
}
