import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicApi, Subject } from './academic';
export function SubjectTeacherAssignment({
  subject,
  campusId,
  readOnly = false,
}: {
  subject: Subject;
  campusId: string;
  readOnly?: boolean;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [staffProfileId, setStaff] = useState('');
  const [offeringId, setOffering] = useState('');
  const faculty = useQuery({
    queryKey: ['academic', 'subject-faculty', campusId],
    queryFn: () => academicApi.subjectFaculty(campusId),
    enabled: open,
  });
  const assignment = useMutation({
    mutationFn: () =>
      academicApi.assignSubjectTeacher(subject.id, {
        campusId,
        staffProfileId,
        ...(offeringId ? { offeringId } : {}),
      }),
    onSuccess: async () => {
      setOpen(false);
      setStaff('');
      await client.invalidateQueries();
    },
  });
  const teacher = subject.teachers?.find(
    (t) => t.campusId === campusId,
  )?.staffProfile;
  return (
    <div className="subject-teacher-assignment">
      <p>
        <b>Default teacher:</b>{' '}
        {teacher
          ? `${teacher.user.name}${!teacher.active || teacher.user.status !== 'ACTIVE' ? ' (inactive)' : ''}`
          : 'Not assigned'}
      </p>
      {subject.offerings?.map((o) => (
        <p key={o.id}>
          <b>
            {o.batch.name} · {o.batch.semester.name}:
          </b>{' '}
          {o.faculty.length
            ? o.faculty.map((f) => f.staffProfile.user.name).join(', ')
            : 'No teacher assigned'}
        </p>
      ))}
      {!readOnly && <button
        type="button"
        className="secondary"
        onClick={() => {
          assignment.reset();
          setOpen((v) => !v);
        }}
      >
        {open ? 'Cancel' : 'Assign teacher'}
      </button>}
      {assignment.isSuccess && !open && (
        <p role="status">Teacher assignment saved.</p>
      )}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            assignment.mutate();
          }}
        >
          <label>
            Assign to
            <select
              value={offeringId}
              disabled={assignment.isPending}
              onChange={(e) => setOffering(e.target.value)}
            >
              <option value="">Subject default</option>
              {subject.offerings?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.batch.name} · {o.batch.semester.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {offeringId
              ? 'Adds this teacher to the selected batch. Existing teachers and logged sessions are kept.'
              : 'Used for new batches and existing batches without a teacher. Existing batch assignments stay unchanged.'}
          </p>
          <label>
            Teacher
            <select
              required
              value={staffProfileId}
              disabled={assignment.isPending || faculty.isLoading}
              onChange={(e) => setStaff(e.target.value)}
            >
              <option value="">Choose a teacher</option>
              {faculty.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.user.name}
                </option>
              ))}
            </select>
          </label>
          {faculty.isError && <p role="alert">{faculty.error.message}</p>}
          {faculty.data?.length === 0 && (
            <p>Add faculty access for this campus in User access first.</p>
          )}
          {assignment.error && <p role="alert">{assignment.error.message}</p>}
          <button disabled={!staffProfileId || assignment.isPending}>
            {assignment.isPending ? 'Saving…' : 'Save teacher'}
          </button>
        </form>
      )}
    </div>
  );
}
