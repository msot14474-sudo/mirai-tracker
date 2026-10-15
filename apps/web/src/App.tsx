import { CampusAnalytics } from './CampusAnalytics';
import { StudentLectureFeedback } from './StudentLectureFeedback';
import { advanceSessionGeneration, apiUrl, sessionExpiredEvent } from './http';
import { RequestRecovery, AppErrorBoundary } from './RequestRecovery';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { FormEvent, lazy, Suspense, useEffect, useState } from 'react';
import { academicApi, Campus } from './academic';
import {
  AuthenticatedUser,
  LoginChallenge,
  loadCurrentUser,
  login,
  logout,
  PasswordResetChallenge,
  PasswordResetApproval,
  requestPasswordReset,
  resetPassword,
  UserRole,
  verifyOtp,
  verifyPasswordResetOtp,
} from './auth';
import { LoadingSkeleton } from './LoadingSkeleton';

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

const AiInsights = lazy(() =>
  import('./AiInsights').then((m) => ({ default: m.AiInsights })),
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

const AccountWorkspace = lazy(() =>
  import('./AccountWorkspace').then((module) => ({
    default: module.AccountWorkspace,
  })),
);

const HelpWorkspace = lazy(() =>
  import('./HelpWorkspace').then((module) => ({
    default: module.HelpWorkspace,
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
            src="/mirai-wordmark-light-hd.png"
            alt="Mirai School of Technology"
          />
        </span>
        <div className="campus-gateway-sidebar-rule" aria-hidden="true" />
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
          <div className="campus-gateway-page-identity">
            <div>
              <span>Mirai Tracker</span>
              <strong>Choose campus</strong>
            </div>
          </div>
          <div className="campus-gateway-actions">
            <span className="campus-gateway-role">{roleLabel}</span>
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
          <div className="campus-gateway-intro">
            <p className="campus-gateway-eyebrow">Administration</p>
            <h1>Welcome back, {firstName}</h1>
            <p className="campus-gateway-copy">
              Choose a campus to open its complete management workspace.
            </p>
          </div>

          <section
            className="campus-gateway-selection"
            aria-label={isLoading ? 'Campuses' : undefined}
            aria-labelledby={isLoading ? undefined : 'campus-selection-title'}
          >
            <div className="campus-gateway-summary">
              {isLoading ? (
                <>
                  <div className="campus-summary-skeleton" aria-hidden="true">
                    <span className="skeleton-block" />
                    <span className="skeleton-block" />
                  </div>
                  <span
                    className="skeleton-block campus-summary-helper-placeholder"
                    aria-hidden="true"
                  />
                </>
              ) : (
                <>
                  <div>
                    <span className="campus-gateway-count" aria-hidden="true">
                      {campuses.length.toString().padStart(2, '0')}
                    </span>
                    <strong id="campus-selection-title">
                      {campuses.length} active campuses
                    </strong>
                  </div>
                  <span>Select one to continue</span>
                </>
              )}
            </div>

            {isLoading ? (
              <LoadingSkeleton
                variant="campus"
                label="Loading campuses"
                count={3}
              />
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
                    aria-label={`Open ${campus.name}`}
                  >
                    <span className="campus-choice-topline">
                      <small>{campus.code}</small>
                      <span className="campus-choice-arrow" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M5 12h14m-5-5 5 5-5 5" />
                        </svg>
                      </span>
                    </span>
                    <span className="campus-choice-body">
                      <strong>{campus.name}</strong>
                      <span>Management workspace</span>
                    </span>
                    <span className="campus-choice-timezone">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="8.5" />
                        <path d="M12 7.5V12l3 2" />
                      </svg>
                      {campus.timezone}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="campus-gateway-state">No active campuses found.</p>
            )}
          </section>

          <p className="campus-gateway-security">
            <span aria-hidden="true" />
            <span>Your global access remains active across every campus.</span>
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
  const [googleNotice] = useState(() => {
    const cookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('mirai_google_notice='))
      ?.split('=')[1];
    const notice =
      cookie ?? new URLSearchParams(window.location.search).get('google_error');
    return notice === 'unavailable' || notice === 'failed' ? notice : null;
  });
  useEffect(() => {
    document.cookie = 'mirai_google_notice=; Path=/; SameSite=Lax; Max-Age=0';
    const url = new URL(window.location.href);
    if (url.searchParams.has('google_error')) {
      url.searchParams.delete('google_error');
      window.history.replaceState(
        window.history.state,
        '',
        url.pathname + url.search + url.hash,
      );
    }
  }, []);
  const queryClient = useQueryClient();
  const [assetsReady, setAssetsReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState(
    () => window.localStorage.getItem('mirai:remembered-email') ?? '',
  );
  const [rememberEmail, setRememberEmail] = useState(() =>
    Boolean(window.localStorage.getItem('mirai:remembered-email')),
  );
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [resetChallenge, setResetChallenge] =
    useState<PasswordResetChallenge | null>(null);
  const [resetApproval, setResetApproval] =
    useState<PasswordResetApproval | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: setChallenge,
  });
  const otpMutation = useMutation({
    mutationFn: () => verifyOtp(challenge!.challengeId, code),
    onSuccess: (user) => queryClient.setQueryData(currentUserKey, user),
  });
  const forgotPasswordMutation = useMutation({
    mutationFn: () => requestPasswordReset(email),
    onSuccess: setResetChallenge,
  });
  const verifyResetOtpMutation = useMutation({
    mutationFn: () => verifyPasswordResetOtp(resetChallenge!.challengeId, code),
    onSuccess: (approval) => {
      setResetApproval(approval);
      setCode('');
    },
  });
  const resetPasswordMutation = useMutation({
    mutationFn: () => {
      if (resetPasswordValue.length < 12) {
        throw new Error('Password must contain at least 12 characters.');
      }
      if (resetPasswordValue !== confirmPassword) {
        throw new Error('The two passwords do not match.');
      }
      return resetPassword(resetApproval!.resetToken, resetPasswordValue);
    },
    onSuccess: () => {
      setResetComplete(true);
      setMode('login');
      setResetChallenge(null);
      setResetApproval(null);
      setCode('');
      setPassword('');
      setResetPasswordValue('');
      setConfirmPassword('');
    },
  });

  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (!cancelled) setAssetsReady(true);
    };
    const fallbackTimer = window.setTimeout(reveal, 5_000);
    const sources = [
      '/mirai-wordmark-light-hd.png',
      '/mirai-faculty-hero-v2.png',
      '/mirai-symbol-light.png',
      '/mirai-logo.jpg',
    ];
    const decodeImage = (source: string) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        const finish = () => resolve();
        image.src = source;
        if (image.complete) {
          if (typeof image.decode === 'function') {
            image.decode().then(finish).catch(finish);
          } else {
            finish();
          }
          return;
        }
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
      });

    void Promise.all(sources.map(decodeImage)).then(() => {
      window.clearTimeout(fallbackTimer);
      reveal();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setResetComplete(false);
    if (rememberEmail) {
      window.localStorage.setItem('mirai:remembered-email', email.trim());
    } else {
      window.localStorage.removeItem('mirai:remembered-email');
    }
    loginMutation.mutate();
  }

  function submitOtp(event: FormEvent) {
    event.preventDefault();
    otpMutation.mutate();
  }

  function submitForgotPassword(event: FormEvent) {
    event.preventDefault();
    forgotPasswordMutation.mutate();
  }

  function submitPasswordReset(event: FormEvent) {
    event.preventDefault();
    resetPasswordMutation.mutate();
  }

  function submitResetOtp(event: FormEvent) {
    event.preventDefault();
    verifyResetOtpMutation.mutate();
  }

  function restartLogin() {
    setChallenge(null);
    setResetChallenge(null);
    setResetApproval(null);
    setMode('login');
    setCode('');
    setResetPasswordValue('');
    setConfirmPassword('');
    loginMutation.reset();
    otpMutation.reset();
    forgotPasswordMutation.reset();
    verifyResetOtpMutation.reset();
    resetPasswordMutation.reset();
  }

  const title = challenge
    ? 'Check your email'
    : mode === 'forgot'
      ? resetChallenge
        ? resetApproval
          ? 'Create password'
          : 'Verify reset code'
        : 'Reset password'
      : 'Login to your account';
  const supportingCopy = challenge
    ? `Enter the six-digit code sent to ${challenge.destination}. It expires in 10 minutes.`
    : mode === 'forgot'
      ? resetChallenge
        ? resetApproval
          ? 'Choose a new password for your account.'
          : 'Enter the six-digit code sent to your email.'
        : 'We will email a secure six-digit reset code.'
      : 'Please enter your details.';

  return (
    <main
      className={`auth-shell ${assetsReady ? 'auth-assets-ready' : 'auth-assets-loading'}`}
    >
      <div
        className="auth-preloader"
        role="status"
        aria-label="Loading sign in"
      >
        <span />
        <span />
        <span />
      </div>
      <section className="brand-panel">
        <div className="auth-brand">
          <span className="wordmark-frame auth-wordmark-frame">
            <img
              src="/mirai-wordmark-light-hd.png"
              alt="Mirai School of Technology"
              fetchPriority="high"
            />
          </span>
        </div>
        <div className="auth-visual-safe-zone">
          <div className="auth-portrait" aria-hidden="true">
            <img
              src="/mirai-faculty-hero-v2.png"
              alt=""
              decoding="sync"
              fetchPriority="high"
            />
          </div>
        </div>
        <div className="brand-statement">
          <p className="eyebrow">Course progression</p>
          <h1>
            Plan. Track.
            <br />
            <span>Deliver.</span>
          </h1>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card auth-reference-card">
          <div className="auth-card-heading">
            <div>
              <img
                className="auth-original-icon"
                src="/mirai-logo.jpg"
                alt="Mirai"
                width="64"
                height="64"
              />
              <h2 id="login-title">{title}</h2>
              <p className="supporting-copy">{supportingCopy}</p>
            </div>
          </div>

          {!challenge && mode === 'login' ? (
            <>
              <a className="auth-google-button" href={`${apiUrl}/auth/google`}>
                <svg
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                  width="20"
                  height="20"
                >
                  <path
                    fill="#4285F4"
                    d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.18v5.14h6.62c3.88-3.58 6.07-8.85 6.07-14.82Z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 44c5.54 0 10.18-1.84 13.57-4.97l-6.62-5.14c-1.84 1.23-4.2 1.96-6.95 1.96-5.36 0-9.9-3.62-11.52-8.48H5.64v5.3A20 20 0 0 0 24 44Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M12.48 27.37a12 12 0 0 1 0-7.64v-5.3H5.64a20 20 0 0 0 0 18.24l6.84-5.3Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M24 11.15c3.01 0 5.71 1.04 7.84 3.08l5.88-5.88C34.17 5.04 29.54 3 24 3A20 20 0 0 0 5.64 14.43l6.84 5.3C14.1 14.87 18.64 11.15 24 11.15Z"
                  />
                </svg>
                Continue with Google
              </a>
              <div className="auth-email-divider">
                <span>or login with email</span>
              </div>
              {googleNotice ? (
                <p className="form-error" role="alert">
                  {googleNotice === 'unavailable'
                    ? 'Google sign-in is not available yet. Please use email.'
                    : 'Google sign-in could not be completed. Use your registered Mirai email or sign in below.'}
                </p>
              ) : null}
            </>
          ) : null}

          {resetComplete ? (
            <p className="auth-success-banner" role="status">
              Password updated. Sign in with your new password.
            </p>
          ) : null}

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
                className="secondary-button auth-back-button"
                onClick={restartLogin}
              >
                Use a different account
              </button>
            </form>
          ) : mode === 'forgot' ? (
            resetChallenge ? (
              resetApproval ? (
                <form onSubmit={submitPasswordReset} noValidate>
                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    value={resetPasswordValue}
                    onChange={(event) =>
                      setResetPasswordValue(event.target.value)
                    }
                    required
                    autoFocus
                  />
                  <small className="auth-password-requirement">
                    Use at least 12 characters. {resetPasswordValue.length}/12
                  </small>
                  <label htmlFor="confirm-password">Confirm password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                  {resetPasswordMutation.error ? (
                    <p className="form-error" role="alert">
                      {resetPasswordMutation.error.message}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={resetPasswordMutation.isPending}
                  >
                    {resetPasswordMutation.isPending
                      ? 'Updating…'
                      : 'Update password'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button auth-back-button"
                    onClick={restartLogin}
                  >
                    Back to sign in
                  </button>
                </form>
              ) : (
                <form onSubmit={submitResetOtp}>
                  <label htmlFor="reset-code">Reset code</label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    required
                    autoFocus
                  />
                  {verifyResetOtpMutation.error ? (
                    <p className="form-error" role="alert">
                      {verifyResetOtpMutation.error.message}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={
                      verifyResetOtpMutation.isPending || code.length !== 6
                    }
                  >
                    {verifyResetOtpMutation.isPending
                      ? 'Verifying…'
                      : 'Verify code'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button auth-back-button"
                    onClick={restartLogin}
                  >
                    Back to sign in
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={submitForgotPassword}>
                <label htmlFor="recovery-email">Email</label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@mirai.edu"
                  required
                />
                {forgotPasswordMutation.error ? (
                  <p className="form-error" role="alert">
                    {forgotPasswordMutation.error.message}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={forgotPasswordMutation.isPending}
                >
                  {forgotPasswordMutation.isPending
                    ? 'Sending…'
                    : 'Send reset code'}
                </button>
                <button
                  type="button"
                  className="secondary-button auth-back-button"
                  onClick={restartLogin}
                >
                  Back to sign in
                </button>
              </form>
            )
          ) : (
            <form className="auth-login-form" onSubmit={submitCredentials}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@mirai.edu"
                required
              />

              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="password-toggle secondary-button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="auth-form-options">
                <label
                  className="auth-remember-option"
                  htmlFor="remember-email"
                >
                  <input
                    id="remember-email"
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(event) => setRememberEmail(event.target.checked)}
                  />
                  <span>Remember email</span>
                </label>
                <button
                  type="button"
                  className="secondary-button auth-forgot-button"
                  onClick={() => {
                    setMode('forgot');
                    setResetComplete(false);
                    loginMutation.reset();
                  }}
                >
                  Forgot password?
                </button>
              </div>

              {loginMutation.error ? (
                <p className="form-error" role="alert">
                  {loginMutation.error.message}
                </p>
              ) : null}

              <button type="submit" disabled={loginMutation.isPending}>
                <span>{loginMutation.isPending ? 'Signing in…' : 'Login'}</span>
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

type DashboardView =
  | 'ai-insights'
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
  | 'daily-logging'
  | 'account'
  | 'help';

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
  const [isLeavingDashboard, setIsLeavingDashboard] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const campuses = useQuery({
    queryKey: ['academic', 'campuses'],
    queryFn: academicApi.campuses,
    enabled: isGlobalAdministrator,
  });
  const selectedCampus = campuses.data?.find(
    (campus) => campus.id === selectedCampusId,
  );
  useEffect(() => {
    if (!isLeavingDashboard) return;
    const delay = prefersReducedMotion() ? 0 : 180;
    const timer = window.setTimeout(() => {
      setSelectedCampusId('');
      setActiveView('overview');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isLeavingDashboard]);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        import('./SemesterSetup'),
        import('./SemesterImport'),
        import('./TimetableSetup'),
        import('./LessonPlanWorkspace'),
        import('./TopicScheduleWorkspace'),
        import('./SessionLoggingWorkspace'),
        import('./ProgressDashboard'),
        import('./ExamReadinessView'),
        import('./StudentOverview'),
        import('./AlertCenter'),
        import('./ExportCenter'),
        import('./FacultyAccessWorkspace'),
      ]);

      if (canManageLessonPlans) {
        void warmLessonPlanWorkspace(queryClient);
        void warmTopicScheduleWorkspace(queryClient);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [canManageLessonPlans, queryClient]);

  if (isGlobalAdministrator && !selectedCampus) {
    return (
      <AdminCampusGateway
        user={user}
        campuses={campuses.data ?? []}
        isLoading={campuses.isPending}
        error={campuses.error}
        onRetry={() => campuses.refetch()}
        onSelect={(campusId) => {
          setIsLeavingDashboard(false);
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
            id: 'ai-insights' as const,
            label: 'AI insights',
            icon: 'progress' as const,
          },
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
  const activeViewLabel =
    navigation.find((item) => item.id === activeView)?.label ??
    (activeView === 'account' ? 'My account' : 'Help');

  function openView(view: DashboardView) {
    setProfileMenuOpen(false);
    if (view === activeView) return;
    if (view === 'lesson-plans') void warmLessonPlanWorkspace(queryClient);
    if (view === 'planned-dates') void warmTopicScheduleWorkspace(queryClient);
    setActiveView(view);
  }

  function renderActiveView() {
    switch (activeView) {
      case 'student-view':
        return <StudentOverview />;
      case 'alerts':
        return <AlertCenter />;
      case 'ai-insights':
        return (
          <AiInsights
            key={selectedCampusId}
            campusId={selectedCampusId || undefined}
            canLog={canLogSessions}
            onOpen={openView}
          />
        );
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
            currentUserId={user.id}
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
      case 'account':
        return (
          <AccountWorkspace
            user={user}
            onUserUpdate={(updated) =>
              queryClient.setQueryData(currentUserKey, updated)
            }
          />
        );
      case 'help':
        return <HelpWorkspace onOpenAccount={() => openView('account')} />;
      case 'overview':
      default:
        return (
          <>
            {canViewProgressDashboard ? (
              <CampusAnalytics
                campusId={selectedCampusId || undefined}
                campusName={selectedCampus?.name}
                name={user.name}
              />
            ) : (
              <CampusOverview
                user={user}
                campus={selectedCampus}
                roleLabel={primaryRoleLabel}
                workspaces={navigation}
                onOpen={openView}
              />
            )}
            {canViewStudentOverview ? <StudentLectureFeedback /> : null}
          </>
        );
    }
  }

  return (
    <main
      className={`dashboard-shell ${activeView === 'ai-insights' ? 'dashboard-ai-focus' : ''} ${isLeavingDashboard ? 'route-surface-exit' : 'route-surface-enter'}`}
    >
      <aside className="app-sidebar">
        <button
          type="button"
          className="sidebar-brand"
          aria-label="Mirai Tracker home"
          onClick={() => openView('overview')}
        >
          <span className="wordmark-frame sidebar-wordmark-frame">
            <img src="/mirai-wordmark-light-hd.png" alt="" />
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
              aria-label={item.label}
              aria-current={item.id === activeView ? 'page' : undefined}
              onClick={() => openView(item.id)}
            >
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div
          className={`sidebar-account-wrap ${profileMenuOpen ? 'open' : ''}`}
        >
          <div className="sidebar-account-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => openView('account')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              <span>My account</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openView('help')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01" />
              </svg>
              <span>Help</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />
              </svg>
              <span>
                {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
              </span>
            </button>
          </div>
          <button
            type="button"
            className="sidebar-account"
            aria-label={`Open account menu for ${user.name}`}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            <span className="account-avatar">{initials}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{primaryRoleLabel}</small>
            </span>
            <svg
              className="sidebar-account-chevron"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="m6 12 4-4 4 4" />
            </svg>
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        {activeView !== 'ai-insights' ? (
          <header className="topbar">
            <div className="topbar-title">
              <div>
                <p className="eyebrow">Mirai Tracker</p>
                <strong>
                  {selectedCampus?.name ?? 'Course progression'} ·{' '}
                  {activeViewLabel}
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
                  onClick={() => setIsLeavingDashboard(true)}
                  disabled={isLeavingDashboard}
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
        ) : null}

        <div className="dashboard-content" aria-live="polite">
          <RequestRecovery />
          <AppErrorBoundary key={activeView}>
            <section
              key={activeView}
              id={activeView}
              className="dashboard-view workspace-view-enter"
              aria-label={activeViewLabel}
            >
              <Suspense
                fallback={
                  <LoadingSkeleton
                    variant="panel"
                    label={`Loading ${activeViewLabel.toLowerCase()}`}
                  />
                }
              >
                {renderActiveView()}
              </Suspense>
            </section>
          </AppErrorBoundary>
        </div>
      </div>
    </main>
  );
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

async function warmLessonPlanWorkspace(queryClient: QueryClient) {
  try {
    const { lessonPlanApi } = await import('./lessonPlans');
    const offerings = await queryClient.fetchQuery({
      queryKey: ['lesson-plans', 'offerings'],
      queryFn: lessonPlanApi.offerings,
      staleTime: 60_000,
    });
    const firstOffering = offerings[0];
    if (firstOffering) {
      await queryClient.prefetchQuery({
        queryKey: ['lesson-plans', 'offering', firstOffering.id],
        queryFn: () => lessonPlanApi.offering(firstOffering.id),
        staleTime: 60_000,
      });
    }
  } catch {
    // The workspace itself presents a retryable error if background warming fails.
  }
}

async function warmTopicScheduleWorkspace(queryClient: QueryClient) {
  try {
    const { topicScheduleApi } = await import('./topicSchedules');
    const offerings = await queryClient.fetchQuery({
      queryKey: ['topic-schedules', 'offerings'],
      queryFn: topicScheduleApi.offerings,
      staleTime: 60_000,
    });
    const firstOffering = offerings[0];
    if (firstOffering) {
      await queryClient.prefetchQuery({
        queryKey: ['topic-schedules', 'offering', firstOffering.id],
        queryFn: () => topicScheduleApi.offering(firstOffering.id),
        staleTime: 60_000,
      });
    }
  } catch {
    // The workspace itself presents a retryable error if background warming fails.
  }
}

export function App() {
  const queryClient = useQueryClient();
  const [sessionNotice, setSessionNotice] = useState(false);
  useEffect(() => {
    const expire = () => {
      if (!queryClient.getQueryData(currentUserKey)) return;
      advanceSessionGeneration();
      void queryClient.cancelQueries();
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'current-user',
      });
      queryClient.setQueryData(currentUserKey, null);
      setSessionNotice(true);
    };
    window.addEventListener(sessionExpiredEvent, expire);
    return () => window.removeEventListener(sessionExpiredEvent, expire);
  }, [queryClient]);
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
  }, []);
  const currentUser = useQuery({
    queryKey: currentUserKey,
    queryFn: loadCurrentUser,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    if (currentUser.data === null) {
      void queryClient.cancelQueries({
        predicate: (query) => query.queryKey[0] !== 'current-user',
      });
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'current-user',
      });
    } else if (currentUser.data) {
      setSessionNotice(false);
    }
  }, [currentUser.data, queryClient]);

  if (currentUser.isPending) {
    return <LoadingSkeleton variant="app" label="Checking your session" />;
  }

  if (currentUser.isError && !currentUser.data) {
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
    <>
      {sessionNotice ? (
        <p className="session-notice" role="status">
          Please sign in again to continue.
        </p>
      ) : null}
      <LoginScreen />
    </>
  );
}
