import { academicTracks, academicTrackIdentity } from './tracks';
import { TrackSelect } from './TrackSelect';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicApi } from './academic';
export function SemesterSubjects({
  semesterId,
  campusId,
  onlySubjectId,
}: {
  semesterId: string;
  campusId: string;
  onlySubjectId?: string;
}) {
  const client = useQueryClient();
  const [batchId, setBatch] = useState('');
  const [trackCode, setTrackCode] = useState('');
  const batches = useQuery({
    queryKey: ['academic', 'semester-subjects', semesterId],
    queryFn: () => academicApi.semesterCourses(semesterId),
  });
  const subjects = useQuery({
    queryKey: ['academic', 'subjects', campusId],
    queryFn: () => academicApi.subjects(campusId),
  });
  const save = useMutation({
    mutationFn: (data: Parameters<typeof academicApi.connectSubjects>[1]) =>
      academicApi.connectSubjects(semesterId, data),
    onSuccess: async (data) => {
      setBatch(String((data as { batchId: string }).batchId));
      await client.invalidateQueries();
    },
  });
  return (
    <section
      className="import-card batch-links"
      aria-labelledby="semester-subjects-heading"
    >
      <h3 id="semester-subjects-heading">
        Subjects and batches in this semester
      </h3>
      <p>
        Link subjects to a batch here. The campus manager can then assign
        teachers and build their timetable.
      </p>
      {batches.isError && <p role="alert">{batches.error.message}</p>}
      {batches.data?.map((batch) => (
        <article key={batch.id}>
          <h4>{batch.name}</h4>
          {academicTracks.map((track) => (
            <section key={track.code}>
              <h5>{track.name} track</h5>
              <ul>
                {batch.subjectOfferings
                  .filter((o) => o.academicTrack === track.code)
                  .map((o) => (
                    <li key={o.id}>
                      {o.subject.name} —{' '}
                      {o.faculty
                        .map((f) => f.staffProfile.user.name)
                        .join(', ') || 'Teacher not assigned'}
                    </li>
                  ))}
              </ul>
              {!batch.subjectOfferings.some(
                (o) => o.academicTrack === track.code,
              ) && <p>No subjects linked yet.</p>}
            </section>
          ))}
          {batch.subjectOfferings
            .filter((o) => !o.academicTrack)
            .map((o) => (
              <p key={o.id}>
                {o.subject.name} · {academicTrackIdentity(o.academicTrack).name}
                . Select this subject and its track below.
              </p>
            ))}
        </article>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          save.mutate({
            ...(batchId
              ? { batchId }
              : {
                  batchName: String(data.get('batchName')),
                  batchCode: String(data.get('batchCode')),
                }),
            trackCode,
            trackName: academicTrackIdentity(trackCode).name,
            subjectIds: data.getAll('subjectIds').map(String),
          });
        }}
      >
        <label>
          Batch
          <select
            value={batchId}
            onChange={(e) => {
              setBatch(e.target.value);
              save.reset();
            }}
          >
            <option value="">Create a new batch</option>
            {batches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {!batchId && (
          <div className="form-grid">
            <label>
              Batch name
              <input
                name="batchName"
                required
                maxLength={160}
                placeholder="e.g. First year A"
              />
            </label>
            <label>
              Batch code
              <input
                name="batchCode"
                required
                maxLength={64}
                placeholder="e.g. YEAR1-A"
              />
            </label>
          </div>
        )}
        <TrackSelect value={trackCode} onChange={setTrackCode} />
        <p>
          Mirai and University subjects share the same batch. Choose the track
          for the subjects selected below.
        </p>
        <fieldset>
          <legend>Select subjects for this batch</legend>
          {subjects.isError && <p role="alert">{subjects.error.message}</p>}
          {subjects.data
            ?.filter(
              (subject) => !onlySubjectId || subject.id === onlySubjectId,
            )
            .map((subject) => (
              <label key={subject.id}>
                <input
                  type="checkbox"
                  name="subjectIds"
                  defaultChecked={subject.id === onlySubjectId}
                  value={subject.id}
                />{' '}
                {subject.name}
              </label>
            ))}
          {subjects.isSuccess && !subjects.data.length && (
            <p>
              Add subjects in the Subjects tab first, then return to this
              semester.
            </p>
          )}
        </fieldset>
        <button
          type="submit"
          disabled={
            save.isPending ||
            !subjects.data?.length ||
            batches.isPending ||
            batches.isError
          }
        >
          {save.isPending ? 'Saving…' : 'Save batch and subjects'}
        </button>
        {save.isError && <p role="alert">{save.error.message}</p>}
        {save.isSuccess && (
          <p role="status">
            Subjects linked. They are now available for campus teacher
            assignments and timetable setup.
          </p>
        )}
      </form>
    </section>
  );
}
