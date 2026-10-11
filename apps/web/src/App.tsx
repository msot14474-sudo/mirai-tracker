import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, lazy, Suspense, useState } from 'react';
import { academicApi, Campus } from './academic';
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

const FacultyAccessWorkspace = lazy(() =>
  import('./FacultyAccessWorkspace').then((module) => ({
    default: module.FacultyAccessWorkspace,
  })),
);

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  PROGRAM_MANAGER: 'Administrator',
  CAMPUS_MANAGER: 'Campus Manager',
  FACULTY: 'Faculty',
  STUDENT: 'Student',
};

const currentUserKey = ['current-user'] as const;

function AdminCampusGateway({
  user,
  campuses,
  isLoading,
  error,
  onRetry,
  onSelect,
  onSignOut,
  isSigningOut,
  roleLabel,
}: {
  user: AuthenticatedUser;
  campuses: Campus[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelect: (campusId: string) => void;
  onSignOut: () => void;
  isSigningOut: boolean;
  roleLabel: string;
}) {
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="campus-gateway">
      <aside className="campus-gateway-sidebar">
        <span className="wordmark-frame campus-gateway-wordmark">
          <img
            src="/mirai-wordmark-light.png"
            alt="Mirai School of Technology"
          />
        </span>
        <div className="campus-gateway-account">
          <span className="account-avatar">{initials}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{roleLabel}</small>
          </span>
        </div>
      </aside>

      <section className="campus-gateway-main">
        <header className="campus-gateway-topbar">
          <div>
            <span>Mirai Tracker</span>
            <strong>Choose campus</strong>
          </div>
          <div className="campus-gateway-actions">
            <span>{roleLabel}</span>
            <button
              type="button"
              className="secondary-button"
              onClick={onSignOut}
              disabled={isSigningOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="campus-gateway-content">
          <p className="campus-gateway-eyebrow">Administration</p>
          <h1>Welcome back, {firstName}</h1>
          <p className="campus-gateway-copy">
            Choose a campus to open its complete management workspace.
          </p>

          <div className="campus-gateway-summary">
            <strong>{campuses.length} active campuses</strong>
            <span>Select one to continue</span>
          </div>

          {isLoading ? (
            <p className="campus-gateway-state">Loading campuses…</p>
          ) : error ? (
            <div className="campus-gateway-state" role="alert">
              <p>{error.message}</p>
              <button type="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : campuses.length ? (
            <div className="campus-choice-grid">
              {campuses.map((campus) => (
                <button
                  type="button"
                  className="campus-choice"
                  key={campus.id}
                  onClick={() => onSelect(campus.id)}
                >
                  <span className="campus-choice-topline">
                    <small>{campus.code}</small>
                    <span aria-hidden="true">→</span>
                  </span>
                  <strong>{campus.name}</strong>
                  <span>{campus.timezone}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="campus-gateway-state">No active campuses found.</p>
          )}

          <p className="campus-gateway-security">
            <span aria-hidden="true" />
            Your global access remains active across every campus.
          </p>
        </div>
      </section>
    </main>
  );
}

type NavigationIconName =
  | 'home'
  | 'student'
  | 'alerts'
  | 'progress'
  | 'exports'
  | 'academic'
  | 'faculty'
  | 'timetable'
  | 'lessons'
  | 'sessions';

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const paths: Record<NavigationIconName, React.ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    student: (
      <>
        <path d="m3 8 9-5 9 5-9 5-9-5Z" />
        <path d="M7 11v5c3 2 7 2 10 0v-5" />
      </>
    ),
    alerts: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    progress: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>
    ),
    exports: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M4 21h16" />
      </>
    ),
    academic: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    faculty: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0" />
        <path d="M19 8v6M16 11h6" />
      </>
    ),
    timetable: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4M8 13h3M13 13h3M8 17h3" />
      </>
    ),
    lessons: (
      <>
        <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 1V4Z" />
        <path d="M18 7h2v13h-9" />
      </>
    ),
    sessions: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };

  return (
    <svg
      className="sidebar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

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
        <div className="auth-brand">
          <span className="wordmark-frame auth-wordmark-frame">
            <img
              src="/mirai-wordmark-light.png"
              alt="Mirai School of Technology"
            />
          </span>
        </div>
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

type DashboardView =
  | 'overview'
  | 'student-view'
  | 'alerts'
  | 'progress'
  | 'exam-readiness'
  | 'exports'
  | 'academic-setup'
  | 'semester-import'
  | 'faculty-access'
  | 'timetable'
  | 'lesson-plans'
  | 'planned-dates'
  | 'daily-logging';

type DashboardNavigationItem = {
  id: DashboardView;
  label: string;
  icon: NavigationIconName;
};

function CampusOverview({
  user,
  campus,
  roleLabel,
  workspaces,
  onOpen,
}: {
  user: AuthenticatedUser;
  campus?: Campus;
  roleLabel: string;
  workspaces: DashboardNavigationItem[];
  onOpen: (view: DashboardView) => void;
}) {
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const shortcuts = workspaces
    .filter((item) => item.id !== 'overview')
    .slice(0, 4);

  return (
    <div className="campus-overview">
      <section className="overview-hero">
        <div className="overview-hero-copy">
          <p className="overview-eyebrow">
            {campus?.code ?? roleLabel.toUpperCase()}
          </p>
          <h1>Welcome back, {firstName}</h1>
          <p>
            {campus ? `${campus.name} is ready.` : 'Your workspace is ready.'}
          </p>
          <span className="overview-role">{roleLabel}</span>
        </div>

        <div className="overview-motion" aria-hidden="true">
          <span className="overview-orbit overview-orbit-outer">
            <i />
          </span>
          <span className="overview-orbit overview-orbit-inner">
            <i />
          </span>
          <span className="overview-logo-core">
            <img src="/mirai-symbol-light.png" alt="" />
          </span>
        </div>
      </section>

      <section className="overview-details" aria-label="Selected workspace">
        <div>
          <span>Campus</span>
          <strong>{campus?.name ?? 'Assigned campus'}</strong>
        </div>
        <div>
          <span>Campus code</span>
          <strong>{campus?.code ?? 'Based on your access'}</strong>
        </div>
        <div>
          <span>Timezone</span>
          <strong>{campus?.timezone ?? 'Asia/Kolkata'}</strong>
        </div>
      </section>

      {shortcuts.length ? (
        <section className="overview-shortcuts">
          <div className="overview-section-heading">
            <div>
              <p className="overview-eyebrow">Quick access</p>
              <h2>Campus workspaces</h2>
            </div>
          </div>
          <div className="overview-shortcut-grid">
            {shortcuts.map((item, index) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onOpen(item.id)}
              >
                <span className="overview-shortcut-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <NavigationIcon name={item.icon} />
                <strong>{item.label}</strong>
                <span className="overview-shortcut-action">
                  Open workspace →
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Dashboard({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const roles = user.roles.map((assignment) => assignment.role);
  const isGlobalAdministrator = roles.some(
    (role) => role === 'ADMIN' || role === 'PROGRAM_MANAGER',
  );
  const globalRoleLabel = roles.includes('ADMIN')
    ? roleLabels.ADMIN
    : roleLabels.PROGRAM_MANAGER;
  const [selectedCampusId, setSelectedCampusId] = useState('');
  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
    enabled: isGlobalAdministrator,
  });
  const selectedCampus = campuses.data?.find(
    (campus) => campus.id === selectedCampusId,
  );
  const canManageAcademicCalendar = roles.some(
    (role) => role === 'ADMIN' || role === 'PROGRAM_MANAGER',
  );
  const canManageTimetable = roles.some(
    (role) =>
      role === 'ADMIN' ||
      role === 'PROGRAM_MANAGER' ||
      role === 'CAMPUS_MANAGER',
  );
  const canManageFaculty = canManageTimetable;
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

  if (isGlobalAdministrator && !selectedCampus) {
    return (
      <AdminCampusGateway
        user={user}
        campuses={campuses.data ?? []}
        isLoading={campuses.isPending}
        error={campuses.error}
        onRetry={() => campuses.refetch()}
        onSelect={(campusId) => {
          setSelectedCampusId(campusId);
          setActiveView('overview');
        }}
        onSignOut={() => logoutMutation.mutate()}
        isSigningOut={logoutMutation.isPending}
        roleLabel={globalRoleLabel}
      />
    );
  }

  const navigation: DashboardNavigationItem[] = [
    { id: 'overview', label: 'Overview', icon: 'home' },
    ...(canViewStudentOverview
      ? [
          {
            id: 'student-view' as const,
            label: 'My course progress',
            icon: 'student' as const,
          },
        ]
      : []),
    ...(canManageAcademicCalendar
      ? [
          {
            id: 'academic-setup' as const,
            label: 'Academic setup',
            icon: 'academic' as const,
          },
          {
            id: 'semester-import' as const,
            label: 'Semester import',
            icon: 'academic' as const,
          },
        ]
      : []),
    ...(canManageFaculty
      ? [
          {
            id: 'faculty-access' as const,
            label: 'User access',
            icon: 'faculty' as const,
          },
        ]
      : []),
    ...(canManageTimetable
      ? [
          {
            id: 'timetable' as const,
            label: 'Timetable',
            icon: 'timetable' as const,
          },
        ]
      : []),
    ...(canManageLessonPlans
      ? [
          {
            id: 'lesson-plans' as const,
            label: 'Lesson plans',
            icon: 'lessons' as const,
          },
          {
            id: 'planned-dates' as const,
            label: 'Planned dates',
            icon: 'lessons' as const,
          },
        ]
      : []),
    ...(canLogSessions
      ? [
          {
            id: 'daily-logging' as const,
            label: 'Daily logging',
            icon: 'sessions' as const,
          },
        ]
      : []),
    ...(canViewProgressDashboard
      ? [
          {
            id: 'progress' as const,
            label: 'Progress',
            icon: 'progress' as const,
          },
          {
            id: 'exam-readiness' as const,
            label: 'Exam readiness',
            icon: 'progress' as const,
          },
        ]
      : []),
    ...(canViewAlerts
      ? [{ id: 'alerts' as const, label: 'Alerts', icon: 'alerts' as const }]
      : []),
    ...(canExport
      ? [
          {
            id: 'exports' as const,
            label: 'Reports and exports',
            icon: 'exports' as const,
          },
        ]
      : []),
  ];
  const primaryRoleLabel = roles[0] ? roleLabels[roles[0]] : 'User';
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const activeNavigationItem =
    navigation.find((item) => item.id === activeView) ?? navigation[0]!;

  function openView(view: DashboardView) {
    setActiveView(view);
  }

  function renderActiveView() {
    switch (activeView) {
      case 'student-view':
        return <StudentOverview />;
      case 'alerts':
        return <AlertCenter />;
      case 'progress':
        return <ProgressDashboard scope={progressScope} />;
      case 'exam-readiness':
        return <ExamReadinessView />;
      case 'exports':
        return <ExportCenter />;
      case 'academic-setup':
        return <SemesterSetup initialCampusId={selectedCampusId} />;
      case 'semester-import':
        return <SemesterImport />;
      case 'faculty-access':
        return (
          <FacultyAccessWorkspace
            initialCampusId={selectedCampusId}
            campusLocked={Boolean(selectedCampus)}
            canCreateCampusManagers={roles.some(
              (role) => role === 'ADMIN' || role === 'PROGRAM_MANAGER',
            )}
            canCreateAdministrators={roles.some(
              (role) => role === 'ADMIN' || role === 'PROGRAM_MANAGER',
            )}
          />
        );
      case 'timetable':
        return (
          <TimetableSetup
            initialCampusId={selectedCampusId}
            campusLocked={Boolean(selectedCampus)}
          />
        );
      case 'lesson-plans':
        return <LessonPlanWorkspace />;
      case 'planned-dates':
        return <TopicScheduleWorkspace />;
      case 'daily-logging':
        return <SessionLoggingWorkspace />;
      case 'overview':
      default:
        return (
          <CampusOverview
            user={user}
            campus={selectedCampus}
            roleLabel={primaryRoleLabel}
            workspaces={navigation}
            onOpen={openView}
          />
        );
    }
  }

  return (
    <main className="dashboard-shell">
      <aside className="app-sidebar">
        <button
          type="button"
          className="sidebar-brand"
          aria-label="Mirai Tracker home"
          onClick={() => openView('overview')}
        >
          <span className="wordmark-frame sidebar-wordmark-frame">
            <img src="/mirai-wordmark-light.png" alt="" />
          </span>
          <img
            className="sidebar-symbol"
            src="/mirai-symbol-light.png"
            alt=""
          />
        </button>

        <nav className="sidebar-navigation" aria-label="Workspace navigation">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === activeView ? 'active' : undefined}
              aria-current={item.id === activeView ? 'page' : undefined}
              onClick={() => openView(item.id)}
            >
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-account">
          <span className="account-avatar">{initials}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{primaryRoleLabel}</small>
          </span>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="wordmark-frame topbar-wordmark-frame">
              <img src="/mirai-wordmark.webp" alt="" />
            </span>
            <img className="topbar-brand-logo" src="/mirai-logo.jpg" alt="" />
            <div>
              <p className="eyebrow">Mirai Tracker</p>
              <strong>
                {selectedCampus?.name ?? 'Course progression'} ·{' '}
                {activeNavigationItem.label}
              </strong>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="role-list" aria-label="Assigned roles">
              {roles.map((role) => (
                <span key={role}>{roleLabels[role]}</span>
              ))}
            </div>
            {selectedCampus ? (
              <button
                type="button"
                className="campus-switcher"
                onClick={() => {
                  setSelectedCampusId('');
                  setActiveView('overview');
                }}
              >
                <span>{selectedCampus.name}</span>
                <small>Change campus</small>
              </button>
            ) : null}
            <button
              className="secondary-button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="dashboard-content" aria-live="polite">
          <section
            id={activeView}
            className="dashboard-view"
            aria-label={activeNavigationItem.label}
          >
            <Suspense
              fallback={
                <p className="workspace-loading">
                  Loading {activeNavigationItem.label.toLowerCase()}...
                </p>
              }
            >
              {renderActiveView()}
            </Suspense>
          </section>
        </div>
      </div>
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
        <img className="loading-logo" src="/mirai-logo.jpg" alt="Mirai" />
        <span className="loader" />
        <p>Checking your session…</p>
      </main>
    );
  }

  if (currentUser.isError) {
    return (
      <main className="loading-shell">
        <img className="loading-logo" src="/mirai-logo.jpg" alt="Mirai" />
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
