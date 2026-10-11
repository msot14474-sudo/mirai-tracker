import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { academicApi } from './academic';
import {
  CreateAccessAccountInput,
  CreateFacultyInput,
  facultyAccessApi,
} from './facultyAccess';

type AccountType = 'FACULTY' | 'CAMPUS_MANAGER' | 'ADMIN';

export function FacultyAccessWorkspace({
  initialCampusId = '',
  campusLocked = false,
  canCreateCampusManagers = false,
  canCreateAdministrators = false,
}: {
  initialCampusId?: string;
  campusLocked?: boolean;
  canCreateCampusManagers?: boolean;
  canCreateAdministrators?: boolean;
}) {
  const queryClient = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
  });
  const [campusId, setCampusId] = useState(initialCampusId);
  const [accountType, setAccountType] = useState<AccountType>('FACULTY');

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
  const createAccount = useMutation<
    | { role: 'CAMPUS_MANAGER'; campusId: string }
    | { role: 'ADMIN'; campusId: null },
    Error,
    {
      type: 'CAMPUS_MANAGER' | 'ADMIN';
      input: CreateAccessAccountInput;
    }
  >({
    mutationFn: ({ type, input }) =>
      type === 'ADMIN'
        ? facultyAccessApi.createAdministrator(input)
        : facultyAccessApi.createCampusManager(campusId, input),
    onSuccess: () => form.current?.reset(),
  });

  function chooseAccountType(type: AccountType) {
    setAccountType(type);
    form.current?.reset();
    createFaculty.reset();
    createAccount.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const notificationEmail = String(
      values.get('notificationEmail') ?? '',
    ).trim();
    const account: CreateAccessAccountInput = {
      name: String(values.get('name') ?? ''),
      email: String(values.get('email') ?? ''),
      notificationEmail: notificationEmail || null,
      password: String(values.get('password') ?? ''),
    };

    if (accountType === 'FACULTY') {
      createFaculty.mutate({
        ...account,
        employeeCode: String(values.get('employeeCode') ?? ''),
        staffType: String(values.get('staffType')) as 'REGULAR' | 'VISITING',
        offeringIds: values.getAll('offeringIds').map(String),
      });
      return;
    }

    createAccount.mutate({ type: accountType, input: account });
  }

  const selectedCampus = campuses.data?.find(
    (campus) => campus.id === campusId,
  );
  const isFaculty = accountType === 'FACULTY';
  const formTitle =
    accountType === 'ADMIN'
      ? 'Add administrator'
      : accountType === 'CAMPUS_MANAGER'
        ? 'Add campus manager'
        : 'Add faculty member';
  const isPending = createFaculty.isPending || createAccount.isPending;
  const mutationError = createFaculty.error ?? createAccount.error;
  const createLabel =
    accountType === 'ADMIN'
      ? 'Create administrator'
      : accountType === 'CAMPUS_MANAGER'
        ? 'Create campus manager'
        : 'Create faculty access';

  return (
    <section
      className="semester-workspace faculty-access-workspace"
      aria-labelledby="faculty-access-title"
    >
      <div className="workspace-heading">
        <div>
          <h2 id="faculty-access-title">User access</h2>
        </div>
        <label className="campus-picker">
          Campus
          <select
            value={campusId}
            disabled={campusLocked}
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

      {canCreateCampusManagers || canCreateAdministrators ? (
        <div className="access-type-tabs" aria-label="Account type">
          <button
            type="button"
            aria-pressed={accountType === 'FACULTY'}
            onClick={() => chooseAccountType('FACULTY')}
          >
            Faculty
          </button>
          {canCreateCampusManagers ? (
            <button
              type="button"
              aria-pressed={accountType === 'CAMPUS_MANAGER'}
              onClick={() => chooseAccountType('CAMPUS_MANAGER')}
            >
              Campus Manager
            </button>
          ) : null}
          {canCreateAdministrators ? (
            <button
              type="button"
              aria-pressed={accountType === 'ADMIN'}
              onClick={() => chooseAccountType('ADMIN')}
            >
              Administrator
            </button>
          ) : null}
        </div>
      ) : null}

      {campuses.isError || detail.isError ? (
        <p className="form-error" role="alert">
          {campuses.error?.message ?? detail.error?.message}
        </p>
      ) : null}

      <div
        className={`faculty-access-layout${isFaculty ? '' : ' single-column'}`}
      >
        <form
          ref={form}
          className="setup-card faculty-access-form"
          onSubmit={submit}
        >
          <div>
            <h3>{formTitle}</h3>
            {!isFaculty ? (
              <p className="access-scope-copy">
                {accountType === 'ADMIN'
                  ? 'Global access across all campuses'
                  : (selectedCampus?.name ?? 'Selected campus')}
              </p>
            ) : null}
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

          {isFaculty ? (
            <>
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

              <fieldset className="faculty-offering-picker">
                <legend>Subject access</legend>
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
                        {offering.subject.name} - {offering.batch.code}
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
            </>
          ) : null}

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

          {mutationError ? (
            <p className="form-error" role="alert">
              {mutationError.message}
            </p>
          ) : null}
          {createFaculty.isSuccess ? (
            <p className="form-success" role="status">
              Faculty access created.
            </p>
          ) : null}
          {createAccount.isSuccess ? (
            <p className="form-success" role="status">
              {accountType === 'ADMIN'
                ? 'Administrator access created.'
                : 'Campus Manager access created.'}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={(accountType !== 'ADMIN' && !campusId) || isPending}
          >
            {isPending ? 'Creating access...' : createLabel}
          </button>
        </form>

        {isFaculty ? (
          <div className="faculty-directory">
            <div className="subheading-row">
              <div>
                <h3>Campus faculty</h3>
              </div>
              <span>{detail.data?.faculty.length ?? 0} people</span>
            </div>

            {detail.isLoading ? (
              <p className="empty-copy">Loading faculty...</p>
            ) : null}
            <div className="faculty-directory-list">
              {detail.data?.faculty.map((faculty) => (
                <article key={faculty.id}>
                  <header>
                    <div>
                      <strong>{faculty.user.name}</strong>
                      <span>
                        {faculty.employeeCode} -{' '}
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
                        {assignment.offering.subject.code} -{' '}
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
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
