import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { academicApi } from './academic';
import { LoadingSkeleton } from './LoadingSkeleton';
import {
  CreateAccessAccountInput,
  CreateFacultyInput,
  ManagedAccount,
  UpdateManagedAccountInput,
  facultyAccessApi,
} from './facultyAccess';

type AccountType = 'FACULTY' | 'CAMPUS_MANAGER' | 'ADMIN';

export function FacultyAccessWorkspace({
  initialCampusId = '',
  campusLocked = false,
  canCreateCampusManagers = false,
  canCreateAdministrators = false,
  currentUserId = '',
}: {
  initialCampusId?: string;
  campusLocked?: boolean;
  canCreateCampusManagers?: boolean;
  canCreateAdministrators?: boolean;
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
  });
  const [campusId, setCampusId] = useState(initialCampusId);
  const [accountType, setAccountType] = useState<AccountType>('FACULTY');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  useEffect(() => {
    if (!campusId && campuses.data?.[0]) setCampusId(campuses.data[0].id);
  }, [campusId, campuses.data]);

  const detail = useQuery({
    queryKey: ['faculty-access', campusId],
    queryFn: () => facultyAccessApi.campus(campusId),
    enabled: Boolean(campusId),
  });
  const accounts = useQuery({
    queryKey: ['managed-accounts', campusId],
    queryFn: () => facultyAccessApi.accounts(campusId),
    enabled: Boolean(campusId),
  });
  const createFaculty = useMutation({
    mutationFn: (input: CreateFacultyInput) =>
      facultyAccessApi.create(campusId, input),
    onSuccess: async () => {
      form.current?.reset();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['faculty-access', campusId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['managed-accounts', campusId],
        }),
      ]);
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
    onSuccess: async () => {
      form.current?.reset();
      await queryClient.invalidateQueries({
        queryKey: ['managed-accounts', campusId],
      });
    },
  });
  const updateAccount = useMutation({
    mutationFn: ({
      userId,
      input,
    }: {
      userId: string;
      input: UpdateManagedAccountInput;
    }) => facultyAccessApi.updateAccount(userId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['managed-accounts', campusId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['faculty-access', campusId],
        }),
      ]);
    },
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

  function submitAccountUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccountId) return;
    const values = new FormData(event.currentTarget);
    const password = String(values.get('managedPassword') ?? '');
    const notificationEmail = String(
      values.get('managedNotificationEmail') ?? '',
    ).trim();
    updateAccount.mutate({
      userId: selectedAccountId,
      input: {
        name: String(values.get('managedName') ?? ''),
        email: String(values.get('managedEmail') ?? ''),
        notificationEmail: notificationEmail || null,
        status: String(values.get('managedStatus')) as 'ACTIVE' | 'SUSPENDED',
        ...(password ? { password } : {}),
      },
    });
  }

  const selectedCampus = campuses.data?.find(
    (campus) => campus.id === campusId,
  );
  const selectedAccount = accounts.data?.accounts?.find(
    (account) => account.id === selectedAccountId,
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
              <LoadingSkeleton variant="list" label="Loading faculty" />
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

      <section
        className="managed-accounts"
        aria-labelledby="managed-accounts-title"
      >
        <div className="subheading-row managed-accounts-heading">
          <div>
            <p className="workspace-kicker">Account controls</p>
            <h3 id="managed-accounts-title">Managed accounts</h3>
          </div>
          <span>{accounts.data?.accounts?.length ?? 0} accounts</span>
        </div>

        {accounts.isLoading ? (
          <LoadingSkeleton variant="list" label="Loading managed accounts" />
        ) : accounts.isError ? (
          <p className="form-error" role="alert">
            {accounts.error.message}
          </p>
        ) : (
          <div className="managed-accounts-layout">
            <div className="managed-account-list">
              {accounts.data?.accounts?.map((account) => (
                <button
                  type="button"
                  key={account.id}
                  className={
                    selectedAccountId === account.id ? 'active' : undefined
                  }
                  onClick={() => {
                    setSelectedAccountId(account.id);
                    updateAccount.reset();
                  }}
                >
                  <span className="managed-account-avatar" aria-hidden="true">
                    {account.name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="managed-account-identity">
                    <strong>
                      {account.name}
                      {account.id === currentUserId ? <small>You</small> : null}
                    </strong>
                    <span>{account.email}</span>
                    <small>{accountRoleLabel(account)}</small>
                  </span>
                  <b
                    className={
                      account.status === 'ACTIVE' ? 'active' : 'inactive'
                    }
                  >
                    {account.status}
                  </b>
                </button>
              ))}
              {accounts.data?.accounts?.length === 0 ? (
                <p className="empty-copy">
                  No manageable accounts in this campus.
                </p>
              ) : null}
            </div>

            {selectedAccount ? (
              <form
                key={selectedAccount.id}
                className="managed-account-editor"
                onSubmit={submitAccountUpdate}
              >
                <header>
                  <div>
                    <p className="workspace-kicker">Editing</p>
                    <h3>{selectedAccount.name}</h3>
                  </div>
                  <span>{accountRoleLabel(selectedAccount)}</span>
                </header>
                <div className="field-pair">
                  <label>
                    Full name
                    <input
                      name="managedName"
                      defaultValue={selectedAccount.name}
                      minLength={2}
                      maxLength={160}
                      required
                    />
                  </label>
                  <label>
                    Login email
                    <input
                      name="managedEmail"
                      type="email"
                      defaultValue={selectedAccount.email}
                      required
                    />
                  </label>
                </div>
                <div className="field-pair">
                  <label>
                    OTP email
                    <input
                      name="managedNotificationEmail"
                      type="email"
                      defaultValue={selectedAccount.notificationEmail ?? ''}
                    />
                  </label>
                  <label>
                    Account status
                    <select
                      name="managedStatus"
                      defaultValue={
                        selectedAccount.status === 'SUSPENDED'
                          ? 'SUSPENDED'
                          : 'ACTIVE'
                      }
                      disabled={selectedAccount.id === currentUserId}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                  </label>
                </div>
                <label>
                  New password <span className="optional-label">Optional</span>
                  <input
                    name="managedPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    placeholder="Leave blank to keep the current password"
                  />
                  <small>
                    At least 12 characters. The current password is never shown.
                  </small>
                </label>
                {updateAccount.error ? (
                  <p className="form-error" role="alert">
                    {updateAccount.error.message}
                  </p>
                ) : null}
                {updateAccount.isSuccess ? (
                  <p className="form-success" role="status">
                    Account changes saved securely.
                  </p>
                ) : null}
                <button type="submit" disabled={updateAccount.isPending}>
                  {updateAccount.isPending ? 'Saving…' : 'Save account changes'}
                </button>
              </form>
            ) : (
              <div className="managed-account-placeholder">
                <span>01</span>
                <h3>Select an account</h3>
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

function accountRoleLabel(account: ManagedAccount) {
  const labels = {
    ADMIN: 'Administrator',
    PROGRAM_MANAGER: 'Administrator',
    CAMPUS_MANAGER: 'Campus Manager',
    FACULTY: 'Faculty',
    STUDENT: 'Student',
  } as const;
  return account.roleAssignments
    .map((assignment) => labels[assignment.role])
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ');
}
