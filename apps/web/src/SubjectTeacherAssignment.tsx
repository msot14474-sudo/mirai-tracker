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
  const [offeringId, setOffering] = useState(
    subject.offerings?.length === 1 ? subject.offerings[0]!.id : '',
  );
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
    onSuccess: async (result) => {
      if (result.subject) {
        const key = ['academic', 'subjects', campusId];
        await client.cancelQueries({ queryKey: key });
        client.setQueryData<Subject[]>(key, (current) =>
          current?.map((item) =>
            item.id === subject.id ? result.subject! : item,
          ),
        );
      }
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
      {teacher && (
        <p className="subject-default-teacher">
          <b>Default for new batches:</b> {teacher.user.name}
          {!teacher.active || teacher.user.status !== 'ACTIVE'
            ? ' (inactive)'
            : ''}
        </p>
      )}
      <div className="subject-batch-list">
        {subject.offerings?.map((o) => (
          <dl className="subject-batch-row" key={o.id}>
            <div>
              <dt>Semester</dt>
              <dd>{o.batch.semester.name}</dd>
            </div>
            <div>
              <dt>Batch</dt>
              <dd>{o.batch.name}</dd>
            </div>
            <div>
              <dt>Assigned teacher</dt>
              <dd className={o.faculty.length ? '' : 'subject-unassigned'}>
                {o.faculty.length
                  ? [
                      ...new Set(
                        o.faculty.map((f) => f.staffProfile.user.name),
                      ),
                    ].join(', ')
                  : 'Not assigned'}
              </dd>
            </div>
          </dl>
        ))}
      </div>
      {!subject.offerings?.length && (
        <p role="status">
          Pending semester link. Link this subject to a semester and batch
          before assigning its teaching timetable.
        </p>
      )}
      {!readOnly && !!subject.offerings?.length && (
        <button
          type="button"
          className="secondary"
          aria-expanded={open}
          onClick={() => {
            assignment.reset();
            if (!open) {
              setOffering(
                subject.offerings?.length === 1 ? subject.offerings[0]!.id : '',
              );
              setStaff('');
            }
            setOpen((v) => !v);
          }}
        >
          {open ? 'Cancel' : 'Assign teacher'}
        </button>
      )}
      {assignment.isSuccess && !open && (
        <p role="status">Teacher assignment saved.</p>
      )}
      {open && !!subject.offerings?.length && (
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
