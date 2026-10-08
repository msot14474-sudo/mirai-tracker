import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, lazy, Suspense, useState } from 'react';
import {
  AuthenticatedUser,
  LoginChallenge,
  loadCurrentUser,
  login,
  logout,
  UserRole,
  verifyOtp,
} from './auth';

const SemesterSetup = lazy(() =>
  import('./SemesterSetup').then((module) => ({
    default: module.SemesterSetup,
  })),
);

const SemesterImport = lazy(() =>
  import('./SemesterImport').then((module) => ({
    default: module.SemesterImport,
  })),
);

const TimetableSetup = lazy(() =>
  import('./TimetableSetup').then((module) => ({
    default: module.TimetableSetup,
  })),
);

const LessonPlanWorkspace = lazy(() =>
  import('./LessonPlanWorkspace').then((module) => ({
    default: module.LessonPlanWorkspace,
  })),
);

const TopicScheduleWorkspace = lazy(() =>
  import('./TopicScheduleWorkspace').then((module) => ({
    default: module.TopicScheduleWorkspace,
  })),
);

const SessionLoggingWorkspace = lazy(() =>
  import('./SessionLoggingWorkspace').then((module) => ({
    default: module.SessionLoggingWorkspace,
  })),
);

const ProgressDashboard = lazy(() =>
  import('./ProgressDashboard').then((module) => ({
    default: module.ProgressDashboard,
  })),
);

const ExamReadinessView = lazy(() =>
  import('./ExamReadinessView').then((module) => ({
    default: module.ExamReadinessView,
  })),
);

const StudentOverview = lazy(() =>
  import('./StudentOverview').then((module) => ({
    default: module.StudentOverview,
  })),
);

const AlertCenter = lazy(() =>
  import('./AlertCenter').then((module) => ({ default: module.AlertCenter })),
);

const ExportCenter = lazy(() =>
  import('./ExportCenter').then((module) => ({ default: module.ExportCenter })),
);

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  PROGRAM_MANAGER: 'Program Manager',
  CAMPUS_MANAGER: 'Campus Manager',
  FACULTY: 'Faculty',
  STUDENT: 'Student',
};

const featureAccess: Record<UserRole, string[]> = {
  ADMIN: ['All campuses', 'Academic setup', 'Reports and exports'],
  PROGRAM_MANAGER: ['All campuses', 'Academic setup', 'Reports and exports'],
  CAMPUS_MANAGER: ['Campus timetable', 'Faculty allocation', 'Campus alerts'],
  FACULTY: [
    'My lesson plans',
    'Daily session logging',
    'My subject progress',
    'Missed-log reminders',
  ],
  STUDENT: ['My covered topics', 'Coming next', 'Exam dates and scope'],
};

const currentUserKey = ['current-user'] as const;

function LoginScreen() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('faculty@mirai.local');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: setChallenge,
  });
  const otpMutation = useMutation({
    mutationFn: () => verifyOtp(challenge!.challengeId, code),
    onSuccess: (user) => queryClient.setQueryData(currentUserKey, user),
  });

  function submitCredentials(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate();
  }

  function submitOtp(event: FormEvent) {
    event.preventDefault();
    otpMutation.mutate();
  }

  function restartLogin() {
    setChallenge(null);
    setCode('');
    loginMutation.reset();
    otpMutation.reset();
  }

  return (
    <main className="auth-shell">
      <section className="brand-panel">
        <p className="eyebrow">MSOT · Course Progression</p>
        <h1>One clear view of every teaching day.</h1>
        <p className="lede">
          Log sessions quickly, follow the academic calendar and catch subjects
          that need attention before the exam window closes.
        </p>
        <div className="principles" aria-label="Product principles">
          <span>Effortless</span>
          <span>Accurate</span>
          <span>Early warning</span>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <p className="step-label">Secure access</p>
          <h2 id="login-title">
            {challenge ? 'Check your email' : 'Welcome back'}
          </h2>
          <p className="supporting-copy">
            {challenge
              ? `Enter the six-digit code sent to ${challenge.destination}. It expires in 10 minutes.`
              : 'Enter your account password. We will email a verification code before creating your session.'}
          </p>

          {challenge ? (
            <form onSubmit={submitOtp}>
              <label htmlFor="otp-code">Verification code</label>
              <input
                id="otp-code"
                name="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                autoFocus
                required
              />

              {otpMutation.error ? (
                <p className="form-error" role="alert">
                  {otpMutation.error.message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={otpMutation.isPending || code.length !== 6}
              >
                {otpMutation.isPending ? 'Verifying…' : 'Verify and sign in'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={restartLogin}
              >
                Use a different account
              </button>
            </form>
          ) : (
            <form onSubmit={submitCredentials}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />

              {loginMutation.error ? (
                <p className="form-error" role="alert">
                  {loginMutation.error.message}
                </p>
              ) : null}

              <button type="submit" disabled={loginMutation.isPending}>
                {loginMutation.isPending
                  ? 'Sending code…'
                  : 'Continue with email code'}
              </button>
            </form>
          )}

          <div className="demo-note">
            <strong>Local demo accounts</strong>
            <span>
              admin, campus.manager, faculty or student{' '}
              <code>@mirai.local</code>
            </span>
            <span>
              Verification codes arrive in Mailpit locally and the configured
              notification inbox in production.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const roles = user.roles.map((assignment) => assignment.role);
  const features = [...new Set(roles.flatMap((role) => featureAccess[role]))];
  const canManageAcademicCalendar = roles.some(
    (role) => role === 'ADMIN' || role === 'PROGRAM_MANAGER',
  );
  const canManageTimetable = roles.some(
    (role) =>
      role === 'ADMIN' ||
      role === 'PROGRAM_MANAGER' ||
      role === 'CAMPUS_MANAGER',
  );
  const canManageLessonPlans = roles.some(
    (role) =>
      role === 'ADMIN' ||
      role === 'PROGRAM_MANAGER' ||
      role === 'CAMPUS_MANAGER' ||
      role === 'FACULTY',
  );
  const canLogSessions = roles.includes('FACULTY');
  const canViewStudentOverview = roles.includes('STUDENT');
  const canViewAlerts = roles.some(
    (role) => role === 'FACULTY' || role === 'CAMPUS_MANAGER',
  );
  const canViewProgressDashboard = roles.some((role) => role !== 'STUDENT');
  const canExport = roles.some(
    (role) => role === 'ADMIN' || role === 'PROGRAM_MANAGER',
  );
  const progressScope = roles.some(
    (role) =>
      role === 'ADMIN' ||
      role === 'PROGRAM_MANAGER' ||
      role === 'CAMPUS_MANAGER',
  )
    ? 'manager'
    : 'faculty';
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(currentUserKey, null),
  });

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Mirai Tracker</p>
          <strong>Course progression</strong>
        </div>
        <button
          className="secondary-button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          Sign out
        </button>
      </header>

      <section className="welcome-card">
        <div>
          <p className="step-label">Authenticated workspace</p>
          <h1>Welcome, {user.name}</h1>
          <p className="lede">{user.email}</p>
        </div>
        <div className="role-list" aria-label="Assigned roles">
          {roles.map((role) => (
            <span key={role}>{roleLabels[role]}</span>
          ))}
        </div>
      </section>

      <section className="access-section" aria-labelledby="access-title">
        <div>
          <p className="step-label">Your access</p>
          <h2 id="access-title">Available workspaces</h2>
        </div>
        <div className="access-grid">
          {features.map((feature, index) => (
            <article key={feature}>
              <span className="feature-number">0{index + 1}</span>
              <h3>{feature}</h3>
              <p>Permission verified from your current role and scope.</p>
            </article>
          ))}
        </div>
      </section>
      {canViewStudentOverview ? (
        <Suspense
          fallback={
            <p className="workspace-loading">Loading your course view…</p>
          }
        >
          <StudentOverview />
        </Suspense>
      ) : null}
      {canViewAlerts ? (
        <Suspense
          fallback={<p className="workspace-loading">Loading alerts…</p>}
        >
          <AlertCenter />
        </Suspense>
      ) : null}
      {canViewProgressDashboard ? (
        <>
          <Suspense
            fallback={<p className="workspace-loading">Loading progress…</p>}
          >
            <ProgressDashboard scope={progressScope} />
          </Suspense>
          <Suspense
            fallback={
              <p className="workspace-loading">Loading exam readiness…</p>
            }
          >
            <ExamReadinessView />
          </Suspense>
        </>
      ) : null}
      {canExport ? (
        <Suspense
          fallback={<p className="workspace-loading">Loading exports…</p>}
        >
          <ExportCenter />
        </Suspense>
      ) : null}
      {canManageAcademicCalendar ? (
        <>
          <Suspense
            fallback={
              <p className="workspace-loading">Loading academic setup…</p>
            }
          >
            <SemesterSetup />
          </Suspense>
          <Suspense
            fallback={
              <p className="workspace-loading">Loading semester import…</p>
            }
          >
            <SemesterImport />
          </Suspense>
        </>
      ) : null}
      {canManageTimetable ? (
        <Suspense
          fallback={<p className="workspace-loading">Loading timetable…</p>}
        >
          <TimetableSetup />
        </Suspense>
      ) : null}
      {canManageLessonPlans ? (
        <>
          <Suspense
            fallback={
              <p className="workspace-loading">Loading lesson plans…</p>
            }
          >
            <LessonPlanWorkspace />
          </Suspense>
          <Suspense
            fallback={
              <p className="workspace-loading">Loading planned dates…</p>
            }
          >
            <TopicScheduleWorkspace />
          </Suspense>
        </>
      ) : null}
      {canLogSessions ? (
        <Suspense
          fallback={<p className="workspace-loading">Loading daily classes…</p>}
        >
          <SessionLoggingWorkspace />
        </Suspense>
      ) : null}
    </main>
  );
}

export function App() {
  const currentUser = useQuery({
    queryKey: currentUserKey,
    queryFn: loadCurrentUser,
    retry: false,
  });

  if (currentUser.isPending) {
    return (
      <main className="loading-shell" aria-live="polite">
        <span className="loader" />
        <p>Checking your session…</p>
      </main>
    );
  }

  if (currentUser.isError) {
    return (
      <main className="loading-shell">
        <p className="form-error">{currentUser.error.message}</p>
        <button onClick={() => currentUser.refetch()}>Try again</button>
      </main>
    );
  }

  return currentUser.data ? (
    <Dashboard user={currentUser.data} />
  ) : (
    <LoginScreen />
  );
}
