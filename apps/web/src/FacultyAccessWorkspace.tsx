import './MobileWorkflows.css';
import { StudentAccessImport } from './StudentAccessImport';
import { StudentEnrollmentFields } from './StudentEnrollmentFields';
import { CampusTeamDirectory } from './CampusTeamDirectory';
import { SubjectTeacherAssignment } from './SubjectTeacherAssignment';
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
  readOnly = false,
  facultyOnly = false,
  canAssignTeachers = true,
}: {
  initialCampusId?: string;
  campusLocked?: boolean;
  canCreateCampusManagers?: boolean;
  canCreateAdministrators?: boolean;
  currentUserId?: string;
  readOnly?: boolean;
  facultyOnly?: boolean;
  canAssignTeachers?: boolean;
}) {
  const queryClient = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const accountEditor = useRef<HTMLFormElement>(null);
  const pendingEditorFocus = useRef(false);
  const [editorFocusRequest, requestEditorFocus] = useState(0);
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
  });
  const [campusId, setCampusId] = useState(initialCampusId);
  const [showCreate, setShowCreate] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [facultyCampusId, setFacultyCampus] = useState(initialCampusId);
  const [managerCampusId, setManagerCampusId] = useState('');
  const [editRole, setEditRole] = useState('');
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [accountType, setAccountType] = useState<AccountType>('FACULTY');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [revokeAccountId, setRevokeAccountId] = useState('');

  useEffect(() => {
    if (!pendingEditorFocus.current) return;
    const editor = showCreate ? form.current : accountEditor.current;
    if (!editor) return;
    pendingEditorFocus.current = false;
    editor
      .querySelector<HTMLInputElement>(
        'input:not([type="hidden"]):not(:disabled), select:not(:disabled)',
      )
      ?.focus({ preventScroll: true });
    if (window.matchMedia?.('(max-width: 1050px)').matches) {
      editor.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    }
  }, [showCreate, selectedAccountId, editorFocusRequest]);

  useEffect(() => {
    if (!campusId && campuses.data?.[0]) setCampusId(campuses.data[0].id);
  }, [campusId, campuses.data]);

  const detail = useQuery({
    queryKey: ['faculty-access', campusId],
    queryFn: () => facultyAccessApi.campus(campusId),
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
    enabled: Boolean(campusId) && !readOnly,
  });
  const creationCampus = useQuery({
    queryKey: ['faculty-access', facultyCampusId],
    queryFn: () => facultyAccessApi.campus(facultyCampusId),
    enabled: showCreate && accountType === 'FACULTY' && !!facultyCampusId,
  });
  const subjectCatalog = useQuery({
    queryKey: ['academic', 'subjects', campusId],
    queryFn: () => academicApi.subjects(campusId),
    enabled: Boolean(campusId) && !readOnly,
  });
  const network = useQuery({
    queryKey: ['faculty-access', 'network'],
    queryFn: facultyAccessApi.network,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
  });
  const accounts = useQuery({
    queryKey: ['managed-accounts', campusId],
    queryFn: () => facultyAccessApi.accounts(campusId),
    enabled: Boolean(campusId) && !readOnly,
  });
  const createFaculty = useMutation({
    mutationFn: (input: CreateFacultyInput) =>
      facultyAccessApi.create(facultyCampusId, input),
    onSuccess: async () => {
      form.current?.reset();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['faculty-access'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['managed-accounts'],
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
      assignedCampusId: string;
    }
  >({
    mutationFn: ({ type, input, assignedCampusId }) =>
      type === 'ADMIN'
        ? facultyAccessApi.createAdministrator(input)
        : facultyAccessApi.createCampusManager(assignedCampusId, input),
    onSuccess: async () => {
      form.current?.reset();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['managed-accounts'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['faculty-access'],
        }),
      ]);
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
      setRevokeAccountId('');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['managed-accounts'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['faculty-access'],
        }),
      ]);
    },
  });

  function chooseAccountType(type: AccountType) {
    setAccountType(type);
    setManagerCampusId('');
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
      if (!facultyCampusId) return;
      createFaculty.mutate({
        ...account,
        employeeCode: String(values.get('employeeCode') ?? ''),
        staffType: String(values.get('staffType')) as 'REGULAR' | 'VISITING',
        offeringIds: canAssignTeachers
          ? values.getAll('offeringIds').map(String)
          : [],
      });
      return;
    }

    if (accountType === 'CAMPUS_MANAGER' && !managerCampusId) return;
    createAccount.mutate({
      type: accountType,
      input: account,
      assignedCampusId: managerCampusId,
    });
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
        ...(values.get('managedRole') || values.get('managedCampus')
          ? {
              role: String(
                values.get('managedRole') || 'CAMPUS_MANAGER',
              ) as UpdateManagedAccountInput['role'],
              campusId: String(values.get('managedCampus') || campusId),
            }
          : {}),
        ...(password ? { password } : {}),
        ...(values.get('studentBatchId')
          ? { studentBatchId: String(values.get('studentBatchId')) }
          : {}),
      },
    });
  }

  const selectedCampus = campuses.data?.find(
    (campus) => campus.id === campusId,
  );
  const selectedAccount = accounts.data?.accounts?.find(
    (account) => account.id === selectedAccountId,
  );
  useEffect(() => {
    setEditRole('');
  }, [selectedAccountId]);
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

      {campuses.isError || detail.isError ? (
        <p className="form-error" role="alert">
          {campuses.error?.message ?? detail.error?.message}
        </p>
      ) : null}

      {!readOnly && (
        <section
          className="managed-accounts"
          aria-labelledby="managed-accounts-title"
        >
          <div className="subheading-row managed-accounts-heading">
            <div>
              <p className="workspace-kicker">Account controls</p>
              <h3 id="managed-accounts-title">People with access</h3>
              <p>
                Add faculty individually or grant student access from an Excel
                or CSV file.
              </p>
            </div>
            <div className="access-directory-actions">
              <span>
                {accounts.isLoading
                  ? 'Loading accounts…'
                  : accounts.isError
                    ? 'Accounts unavailable'
                    : `${accounts.data?.accounts?.length ?? 0} accounts`}
              </span>
              <button
                type="button"
                onClick={() => setShowStudents(!showStudents)}
              >
                {showStudents ? 'Close student tools' : 'Student Excel / CSV'}
              </button>
              <button
                type="button"
                onClick={() => {
                  pendingEditorFocus.current = true;
                  requestEditorFocus((request) => request + 1);
                  setShowCreate(true);
                  setSelectedAccountId('');
                }}
              >
                Add new
              </button>
            </div>
          </div>

          {showStudents && campusId && (
            <StudentAccessImport key={campusId} campusId={campusId} />
          )}
          <label className="access-role-filter">
            Role
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="ALL">All roles</option>
              <option value="FACULTY">Faculty</option>
              <option value="STUDENT">Students</option>
              {!facultyOnly && (
                <>
                  <option value="CAMPUS_MANAGER">Campus managers</option>
                  <option value="ADMIN">Administrators</option>
                </>
              )}
            </select>
          </label>
          {accounts.isLoading ? (
            <LoadingSkeleton variant="list" label="Loading managed accounts" />
          ) : accounts.isError ? (
            <p className="form-error" role="alert">
              {accounts.error.message}
            </p>
          ) : (
            <div className="managed-accounts-layout">
              <div className="managed-account-list">
                {accounts.data?.accounts
                  ?.filter(
                    (account) =>
                      accountFilter === 'ALL' ||
                      account.roleAssignments.some(
                        (assignment) =>
                          assignment.role === accountFilter ||
                          (accountFilter === 'ADMIN' &&
                            assignment.role === 'PROGRAM_MANAGER'),
                      ),
                  )
                  .map((account) => (
                    <div key={account.id} className="managed-account-row">
                      <button
                        type="button"
                        className={
                          selectedAccountId === account.id
                            ? 'active'
                            : undefined
                        }
                        onClick={() => {
                          pendingEditorFocus.current = true;
                          requestEditorFocus((request) => request + 1);
                          setShowCreate(false);
                          setSelectedAccountId(account.id);
                          updateAccount.reset();
                        }}
                      >
                        <span
                          className="managed-account-avatar"
                          aria-hidden="true"
                        >
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
                            {account.id === currentUserId ? (
                              <small>You</small>
                            ) : null}
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
                      {account.status === 'SUSPENDED' ||
                      account.status === 'ARCHIVED' ? (
                        <small className="account-access-note">
                          Access removed
                        </small>
                      ) : account.id === currentUserId ? (
                        <small className="account-access-note">
                          Another administrator can remove your access.
                        </small>
                      ) : revokeAccountId === account.id ? (
                        <div
                          className="access-revoke"
                          role="group"
                          aria-label={`Remove access for ${account.name}`}
                        >
                          <p>
                            Remove access for {account.name}? Sign-in and
                            existing sessions will be blocked. Academic records
                            are kept.
                          </p>
                          <button
                            type="button"
                            disabled={updateAccount.isPending}
                            onClick={() =>
                              updateAccount.mutate({
                                userId: account.id,
                                input: { status: 'SUSPENDED' },
                              })
                            }
                          >
                            {updateAccount.isPending
                              ? 'Removing…'
                              : 'Confirm remove access'}
                          </button>
                          <button
                            type="button"
                            disabled={updateAccount.isPending}
                            onClick={() => setRevokeAccountId('')}
                          >
                            Cancel
                          </button>
                          {updateAccount.error ? (
                            <p className="form-error" role="alert">
                              {updateAccount.error.message}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          className="account-remove-button"
                          type="button"
                          aria-label={`Remove access for ${account.name}`}
                          disabled={updateAccount.isPending}
                          onClick={() => {
                            updateAccount.reset();
                            setRevokeAccountId(account.id);
                          }}
                        >
                          Remove access
                        </button>
                      )}
                    </div>
                  ))}
                {accounts.data?.accounts?.length === 0 ? (
                  <p className="empty-copy">
                    No manageable accounts in this campus.
                  </p>
                ) : null}
              </div>

              {showCreate ? (
                <div className="access-create-panel">
                  <button
                    type="button"
                    className="access-close-create"
                    disabled={isPending}
                    onClick={() => setShowCreate(false)}
                  >
                    Close
                  </button>
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
                            : 'Choose the campus this manager will manage.'}
                        </p>
                      ) : null}
                    </div>

                    {accountType === 'FACULTY' && (
                      <label>
                        Faculty campus
                        <select
                          required
                          aria-label="Faculty campus"
                          value={facultyCampusId}
                          onChange={(e) => {
                            setFacultyCampus(e.target.value);
                            createFaculty.reset();
                          }}
                        >
                          <option value="">Choose a campus</option>
                          {campuses.data?.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <small>
                          Faculty access and subject assignments belong to this
                          campus.
                        </small>
                      </label>
                    )}
                    {accountType === 'CAMPUS_MANAGER' && (
                      <label>
                        Assigned campus
                        <select
                          required
                          aria-label="Assigned campus"
                          value={managerCampusId}
                          onChange={(e) => setManagerCampusId(e.target.value)}
                        >
                          <option value="">Choose a campus</option>
                          {campuses.data?.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <small>
                          This manager can manage only the selected campus.
                        </small>
                      </label>
                    )}

                    <label>
                      Full name
                      <input
                        name="name"
                        minLength={2}
                        maxLength={160}
                        required
                      />
                    </label>
                    <div className="field-pair">
                      <label>
                        Login email
                        <input
                          name="email"
                          type="email"
                          autoComplete="off"
                          required
                        />
                      </label>
                      <label>
                        Different OTP email{' '}
                        <span className="optional-label">Optional</span>
                        <input
                          name="notificationEmail"
                          type="email"
                          autoComplete="off"
                        />
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

                        {canAssignTeachers && (
                          <fieldset className="faculty-offering-picker">
                            <legend>Subject access</legend>
                            <div>
                              {creationCampus.data?.offerings.map(
                                (offering) => (
                                  <label
                                    key={`${facultyCampusId}:${offering.id}`}
                                  >
                                    <input
                                      type="checkbox"
                                      name="offeringIds"
                                      disabled={!canAssignTeachers}
                                      value={offering.id}
                                    />
                                    <span>
                                      <strong>{offering.subject.code}</strong>
                                      {offering.subject.name} -{' '}
                                      {offering.batch.code}
                                      <small>
                                        {offering.batch.semester.name}
                                      </small>
                                    </span>
                                  </label>
                                ),
                              )}
                              {creationCampus.data?.offerings.length === 0 ? (
                                <p className="empty-copy">
                                  Create a semester and subject offering first.
                                </p>
                              ) : null}
                            </div>
                          </fieldset>
                        )}
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
                      <small>
                        Use at least 12 characters and share it privately.
                      </small>
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
                          ? 'Administrator access assigned.'
                          : 'Campus Manager access assigned.'}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={
                        (accountType === 'FACULTY' && !facultyCampusId) ||
                        (accountType === 'CAMPUS_MANAGER' &&
                          !managerCampusId) ||
                        isPending
                      }
                    >
                      {isPending ? 'Creating access...' : createLabel}
                    </button>
                  </form>
                </div>
              ) : selectedAccount ? (
                <form
                  key={
                    selectedAccount.id +
                    selectedAccount.status +
                    accountRoleLabel(selectedAccount)
                  }
                  ref={accountEditor}
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
                  {selectedAccount.roleAssignments.some(
                    (r) => r.role === 'STUDENT',
                  ) &&
                    !editRole && (
                      <StudentEnrollmentFields
                        key={selectedAccount.id}
                        campusId={campusId}
                        account={selectedAccount}
                      />
                    )}
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
                  {(canCreateAdministrators || canCreateCampusManagers) &&
                  selectedAccount.id !== currentUserId ? (
                    <label>
                      Change role
                      <select
                        name="managedRole"
                        defaultValue=""
                        onChange={(e) => setEditRole(e.target.value)}
                      >
                        <option value="">Keep current role</option>
                        <option value="ADMIN">Administrator</option>
                        <option value="CAMPUS_MANAGER">Campus manager</option>
                        {selectedAccount.staffProfile ? (
                          <option value="FACULTY">Faculty</option>
                        ) : null}
                        {selectedAccount.studentProfile ? (
                          <option value="STUDENT">Student</option>
                        ) : null}
                      </select>
                      <small>
                        The selected role replaces all previous access roles.
                      </small>
                    </label>
                  ) : null}
                  {(canCreateAdministrators || canCreateCampusManagers) &&
                    selectedAccount.id !== currentUserId &&
                    (editRole === 'CAMPUS_MANAGER' ||
                      (!editRole &&
                        selectedAccount.roleAssignments.some(
                          (r) => r.role === 'CAMPUS_MANAGER',
                        ))) && (
                      <label>
                        Assigned campus
                        <select
                          name="managedCampus"
                          aria-label="Assigned campus"
                          required
                          defaultValue={
                            selectedAccount.roleAssignments.find(
                              (r) => r.role === 'CAMPUS_MANAGER',
                            )?.campusId || ''
                          }
                        >
                          <option value="">Choose a campus</option>
                          {campuses.data?.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <small>
                          Saving replaces previous campus-manager access with
                          this campus.
                        </small>
                      </label>
                    )}
                  <label>
                    New password{' '}
                    <span className="optional-label">Optional</span>
                    <input
                      name="managedPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={256}
                      placeholder="Leave blank to keep the current password"
                    />
                    <small>
                      At least 12 characters. The current password is never
                      shown.
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
                  {selectedAccount.status === 'SUSPENDED' ? (
                    <p role="status">
                      Access removed. This account cannot sign in.
                    </p>
                  ) : null}
                  <button type="submit" disabled={updateAccount.isPending}>
                    {updateAccount.isPending
                      ? 'Saving…'
                      : 'Save account changes'}
                  </button>
                </form>
              ) : (
                <div className="managed-account-placeholder">
                  <h3>Select an account</h3>
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <section
        className="setup-card campus-team-panel"
        aria-label="Campus people and assignments"
      >
        {network.isLoading && (
          <LoadingSkeleton variant="list" label="Loading campus team" />
        )}
        {network.error && (
          <p role="alert" className="form-error">
            {network.error.message}
          </p>
        )}
        {network.data
          ?.filter((campus) => campus.id === campusId)
          .map((campus) => (
            <CampusTeamDirectory key={campus.id} campus={campus} />
          ))}
      </section>

      {!readOnly && canAssignTeachers && (
        <details className="setup-card campus-assignment-panel">
          <summary>Assign teachers to campus subjects</summary>
          {subjectCatalog.error && (
            <p role="alert">{subjectCatalog.error.message}</p>
          )}
          {Array.isArray(subjectCatalog.data) &&
            subjectCatalog.data.map((subject) => (
              <article key={subject.id}>
                <h4>{subject.name}</h4>
                <SubjectTeacherAssignment
                  subject={subject}
                  campusId={campusId}
                  readOnly={!canAssignTeachers}
                />
              </article>
            ))}
        </details>
      )}
    </section>
  );
}

function accountRoleLabel(account: ManagedAccount) {
  const labels = {
    ADMIN: 'Administrator',
    PROGRAM_MANAGER: 'Program Manager',
    CAMPUS_MANAGER: 'Campus Manager',
    FACULTY: 'Faculty',
    STUDENT: 'Student',
  } as const;
  return account.roleAssignments
    .map((assignment) => labels[assignment.role])
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ');
}
