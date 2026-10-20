import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academicApi } from './academic';
import { ManagedAccount } from './facultyAccess';

export function StudentEnrollmentFields({
  campusId,
  account,
}: {
  campusId: string;
  account: ManagedAccount;
}) {
  const [semesterId, setSemesterId] = useState('');
  const semesters = useQuery({
    queryKey: ['academic', 'semesters', campusId],
    queryFn: () => academicApi.semesters(campusId),
  });
  const courses = useQuery({
    queryKey: ['academic', 'semester-subjects', semesterId],
    queryFn: () => academicApi.semesterCourses(semesterId),
    enabled: !!semesterId,
  });
  const profile = account.studentProfile;
  return (
    <fieldset>
      <legend>Student enrolment</legend>
      <p>
        {profile
          ? `${profile.batch.semester?.campus.name || account.roleAssignments.find((r) => r.role === 'STUDENT')?.campus?.name || 'Assigned campus'} · ${profile.batch.name}${profile.batch.semester ? ` · ${profile.batch.semester.name}` : ''}`
          : 'No batch linked yet. Choose the student’s semester and batch so their subjects appear.'}
      </p>
      <div className="field-pair">
        <label>
          Student semester
          <select
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            <option value="">Keep current enrolment</option>
            {semesters.data
              ?.filter((s) => s.status !== 'ARCHIVED')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Student batch
          <select
            key={semesterId}
            name="studentBatchId"
            defaultValue=""
            disabled={!semesterId || courses.isPending || courses.isError}
            required={!!semesterId}
          >
            <option value="">Choose a batch</option>
            {courses.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.code}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(semesters.isError || courses.isError) && (
        <p role="alert">
          Student enrolment options could not load. Reopen the account to try
          again.
        </p>
      )}
      {!!semesterId && courses.data && !courses.data.length && (
        <p>No batch has been created in this semester yet.</p>
      )}
    </fieldset>
  );
}
