import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { academicApi } from './academic';
import { CreateFacultyInput, facultyAccessApi } from './facultyAccess';

export function FacultyAccessWorkspace() {
  const queryClient = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
  });
  const [campusId, setCampusId] = useState('');

  useEffect(() => {
    if (!campusId && campuses.data?.[0]) setCampusId(campuses.data[0].id);
  }, [campusId, campuses.data]);

  const detail = useQuery({
    queryKey: ['faculty-access', campusId],
    queryFn: () => facultyAccessApi.campus(campusId),
    enabled: Boolean(campusId),
  });
  const createFaculty = useMutation({
    mutationFn: (input: CreateFacultyInput) =>
      facultyAccessApi.create(campusId, input),
    onSuccess: async () => {
      form.current?.reset();
      await queryClient.invalidateQueries({
        queryKey: ['faculty-access', campusId],
      });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const notificationEmail = String(
      values.get('notificationEmail') ?? '',
    ).trim();
    createFaculty.mutate({
      name: String(values.get('name') ?? ''),
      email: String(values.get('email') ?? ''),
      notificationEmail: notificationEmail || null,
      employeeCode: String(values.get('employeeCode') ?? ''),
      staffType: String(values.get('staffType')) as 'REGULAR' | 'VISITING',
      password: String(values.get('password') ?? ''),
      offeringIds: values.getAll('offeringIds').map(String),
    });
  }

  return (
    <section
      className="semester-workspace faculty-access-workspace"
      aria-labelledby="faculty-access-title"
    >
      <div className="workspace-heading">
        <div>
          <p className="step-label">Access · Campus team</p>
          <h2 id="faculty-access-title">Faculty access</h2>
          <p>
            Create faculty accounts only inside your managed campus. Passwords
            are hashed, OTPs go to the faculty mailbox and every creation is
            audited.
          </p>
        </div>
        <label className="campus-picker">
          Campus
          <select
            value={campusId}
            onChange={(event) => setCampusId(event.target.value)}
          >
            <option value="">Select campus</option>
            {campuses.data?.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {campuses.isError || detail.isError ? (
        <p className="form-error" role="alert">
          {campuses.error?.message ?? detail.error?.message}
        </p>
      ) : null}

      <div className="faculty-access-layout">
        <form
          ref={form}
          className="setup-card faculty-access-form"
          onSubmit={submit}
        >
          <div>
            <p className="step-label">New account</p>
            <h3>Add faculty member</h3>
          </div>

          <label>
            Full name
            <input name="name" minLength={2} maxLength={160} required />
          </label>
          <div className="field-pair">
            <label>
              Login email
              <input name="email" type="email" autoComplete="off" required />
            </label>
            <label>
              Different OTP email{' '}
              <span className="optional-label">Optional</span>
              <input name="notificationEmail" type="email" autoComplete="off" />
            </label>
          </div>
          <div className="field-pair">
            <label>
              Employee code
              <input
                name="employeeCode"
                minLength={2}
                maxLength={64}
                required
              />
            </label>
            <label>
              Faculty type
              <select name="staffType" defaultValue="REGULAR">
                <option value="REGULAR">Regular</option>
                <option value="VISITING">Visiting</option>
              </select>
            </label>
          </div>
          <label>
            Account password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              required
            />
            <small>Use at least 12 characters and share it privately.</small>
          </label>

          <fieldset className="faculty-offering-picker">
            <legend>Subject access</legend>
            <p>
              Select the subjects this faculty member will teach. You may leave
              this empty while teaching allocation is still pending.
            </p>
            <div>
              {detail.data?.offerings.map((offering) => (
                <label key={offering.id}>
                  <input
                    type="checkbox"
                    name="offeringIds"
                    value={offering.id}
                  />
                  <span>
                    <strong>{offering.subject.code}</strong>
                    {offering.subject.name} · {offering.batch.code}
                    <small>{offering.batch.semester.name}</small>
                  </span>
                </label>
              ))}
              {detail.data?.offerings.length === 0 ? (
                <p className="empty-copy">
                  Create a semester and subject offering first.
                </p>
              ) : null}
            </div>
          </fieldset>

          {createFaculty.error ? (
            <p className="form-error" role="alert">
              {createFaculty.error.message}
            </p>
          ) : null}
          {createFaculty.isSuccess ? (
            <p className="form-success" role="status">
              Faculty access created. Share the login email and account password
              privately.
            </p>
          ) : null}
          <button type="submit" disabled={!campusId || createFaculty.isPending}>
            {createFaculty.isPending
              ? 'Creating access…'
              : 'Create faculty access'}
          </button>
        </form>

        <div className="faculty-directory">
          <div className="subheading-row">
            <div>
              <p className="step-label">Managed accounts</p>
              <h3>Campus faculty</h3>
            </div>
            <span>{detail.data?.faculty.length ?? 0} people</span>
          </div>

          {detail.isLoading ? (
            <p className="empty-copy">Loading faculty…</p>
          ) : null}
          <div className="faculty-directory-list">
            {detail.data?.faculty.map((faculty) => (
              <article key={faculty.id}>
                <header>
                  <div>
                    <strong>{faculty.user.name}</strong>
                    <span>
                      {faculty.employeeCode} ·{' '}
                      {faculty.staffType === 'VISITING'
                        ? 'Visiting'
                        : 'Regular'}
                    </span>
                  </div>
                  <b
                    className={
                      faculty.user.status === 'ACTIVE' ? 'active' : 'inactive'
                    }
                  >
                    {faculty.user.status}
                  </b>
                </header>
                <p>{faculty.user.email}</p>
                <small>
                  OTP: {faculty.user.notificationEmail ?? faculty.user.email}
                </small>
                <div className="faculty-subject-tags">
                  {faculty.facultyAssignments.map((assignment) => (
                    <span key={assignment.id}>
                      {assignment.offering.subject.code} ·{' '}
                      {assignment.offering.batch.code}
                    </span>
                  ))}
                  {faculty.facultyAssignments.length === 0 ? (
                    <span>Not assigned to a subject yet</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {detail.data?.faculty.length === 0 ? (
            <div className="empty-state faculty-empty-state">
              <span>01</span>
              <h3>Add the first faculty member</h3>
              <p>Their login will be restricted to this campus.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
