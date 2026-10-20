import { apiFetch } from './http';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

const userResponse = (
  role: 'ADMIN' | 'FACULTY' | 'STUDENT' | 'PROGRAM_MANAGER' | 'CAMPUS_MANAGER',
) =>
  new Response(
    JSON.stringify({
      user: {
        id: 'user-a',
        name:
          role === 'ADMIN'
            ? 'Yatharth Vishnoi'
            : role === 'FACULTY'
              ? 'Sample Faculty'
              : role === 'STUDENT'
                ? 'Sample Student'
                : role === 'CAMPUS_MANAGER'
                  ? 'Campus Manager'
                  : 'Program Manager',
        email: `${role.toLowerCase()}@mirai.local`,
        notificationEmail: `${role.toLowerCase()}@example.edu`,
        roles: [{ role, campusId: role === 'ADMIN' ? null : 'campus-a' }],
        staffProfileId: role === 'FACULTY' ? 'faculty-a' : null,
        studentProfile:
          role === 'STUDENT' ? { id: 'student-a', batchId: 'batch-a' } : null,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

describe('App authentication', () => {
  it('shows the login form when there is no session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    renderApp();
    expect(
      await screen.findByRole('heading', { name: 'Login to your account' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByRole('img', { name: 'Mirai' })).toHaveAttribute(
      'src',
      '/mirai-logo.jpg',
    );
    expect(
      screen.getByRole('link', { name: 'Continue with Google' }),
    ).toHaveAttribute('href', expect.stringContaining('/auth/google'));
  });

  it('shows a Google error once without retaining it in the URL or cookie', async () => {
    window.history.replaceState(
      null,
      '',
      '/?google_error=unavailable#progress',
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    renderApp();
    expect(
      await screen.findByText(
        'Google sign-in is not available yet. Please use email.',
      ),
    ).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(document.cookie).not.toContain('mirai_google_notice');
  });

  it('shows a Google callback notice on the clean login URL', async () => {
    document.cookie = 'mirai_google_notice=failed; Path=/';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    renderApp();
    expect(
      await screen.findByText(/Google sign-in could not be completed/),
    ).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(document.cookie).not.toContain('mirai_google_notice');
  });

  it('resets a forgotten password with an emailed code', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, body: init?.body?.toString() });
      if (url.endsWith('/auth/forgot-password')) {
        return new Response(
          JSON.stringify({
            challengeId: 'reset-challenge-identifier-long-enough',
            expiresInSeconds: 600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/verify-reset-otp')) {
        return new Response(
          JSON.stringify({
            resetToken: 'reset-approval-token-long-enough-to-be-valid',
            expiresInSeconds: 600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/reset-password')) {
        return new Response(JSON.stringify({ changed: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 401 });
    });
    renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Forgot password?' }),
    );
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'faculty@mirai.local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));

    expect(
      await screen.findByRole('heading', { name: 'Verify reset code' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reset code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(
      await screen.findByRole('heading', { name: 'Create password' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'a-new-secure-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'a-new-secure-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(
      await screen.findByText(
        'Password updated. Sign in with your new password.',
      ),
    ).toBeInTheDocument();
    expect(
      requests.some((request) => request.url.endsWith('/auth/forgot-password')),
    ).toBe(true);
    const resetRequest = requests.find((request) =>
      request.url.endsWith('/auth/reset-password'),
    );
    expect(JSON.parse(resetRequest!.body!)).toEqual({
      resetToken: 'reset-approval-token-long-enough-to-be-valid',
      password: 'a-new-secure-password',
    });
  });

  it('explains why a short reset password cannot be submitted', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/forgot-password')) {
        return new Response(
          JSON.stringify({
            challengeId: 'reset-challenge-identifier-long-enough',
            expiresInSeconds: 600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/verify-reset-otp')) {
        return new Response(
          JSON.stringify({
            resetToken: 'reset-approval-token-long-enough-to-be-valid',
            expiresInSeconds: 600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(null, { status: 401 });
    });
    renderApp();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Forgot password?' }),
    );
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'faculty@mirai.local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    await screen.findByRole('heading', { name: 'Verify reset code' });
    fireEvent.change(screen.getByLabelText('Reset code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    await screen.findByRole('heading', { name: 'Create password' });

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'short-pass' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'short-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password must contain at least 12 characters.',
    );
  });

  it('opens account and help from the profile menu', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(userResponse('FACULTY'));
    renderApp();

    const accountMenuButton = await screen.findByRole('button', {
      name: 'Open account menu for Sample Faculty',
    });
    fireEvent.click(accountMenuButton);
    expect(
      screen.getByRole('menuitem', { name: 'My account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Help' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Help' }));
    expect(
      await screen.findByRole('heading', { name: 'How can we help?' }),
    ).toBeInTheDocument();

    fireEvent.click(accountMenuButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'My account' }));
    expect(
      await screen.findByRole('heading', { name: 'Account settings' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Login email/ })).toHaveValue(
      'faculty@mirai.local',
    );
  });

  it('returns to sign in when a protected request reports an invalid session', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/auth/me')) return userResponse('FACULTY');
      if (String(input).endsWith('/protected'))
        return new Response(
          JSON.stringify({ message: 'Authentication required.' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        );
      return new Response('[]', {
        headers: { 'content-type': 'application/json' },
      });
    });
    renderApp();
    await screen.findByRole('heading', { name: 'Welcome back, Sample' });
    await act(async () => {
      await expect(apiFetch('/api/protected')).rejects.toMatchObject({
        name: 'AbortError',
      });
    });
    expect(
      await screen.findByText('Please sign in again to continue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' }),
    ).not.toBeInTheDocument();
  });

  it('verifies an email code before displaying role-aware faculty access', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) {
        return new Response(
          JSON.stringify({
            challengeId: 'challenge-identifier-with-enough-length',
            expiresInSeconds: 600,
            destination: 'm***@gmail.com',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/verify-otp')) return userResponse('FACULTY');
      if (url.includes('/ai-insights'))
        return new Response(
          JSON.stringify({
            generatedAt: '2026-10-16T00:00:00Z',
            summary: {
              subjects: 0,
              attention: 0,
              overdueTopics: 0,
              missingLogs: 0,
              needsHelp: 0,
              reviews: 0,
            },
            coverage: { pastLectures: 0, upcomingLectures: 0 },
            subjects: [],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );

      if (
        url.endsWith('/academic/my-subjects') ||
        url.endsWith('/topic-schedules/offerings') ||
        url.endsWith('/academic/campuses')
      )
        return new Response('[]', {
          headers: { 'Content-Type': 'application/json' },
        });
      if (url.endsWith('/lesson-plans/offerings'))
        return new Response('[]', {
          headers: { 'Content-Type': 'application/json' },
        });
      if (url.includes('/session-logs/sessions'))
        return new Response(
          JSON.stringify({ sessions: [], date: '2026-10-13' }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      return new Response(null, { status: 401 });
    });
    renderApp();

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'faculty@mirai.local' },
    });
    fireEvent.change(await screen.findByLabelText('Password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Sample' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Daily logging' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Available workspaces' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Lesson plans and exam scope',
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lesson plans' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Lesson plans and exam scope',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Log today’s classes' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Daily logging' }));
    expect(
      await screen.findByRole('heading', { name: 'Log today’s classes' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Lesson plans and exam scope',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows students only their read-only workspaces', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(userResponse('STUDENT'));
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Sample' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'My course progress' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Available workspaces' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Daily logging' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'My course progress' }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'AI insights' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'My course progress' }));
    expect(
      await screen.findByRole('heading', { name: 'My course progress' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Lesson plans and exam scope',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Planned topic dates' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Log today’s classes' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Progress dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Exam readiness' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Missed-log alerts' }),
    ).not.toBeInTheDocument();
  });

  it('shows the M04 semester workspace only to global managers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return userResponse('PROGRAM_MANAGER');
      if (url.endsWith('/academic/campuses')) {
        return new Response(
          JSON.stringify([
            {
              id: 'campus-a',
              code: 'HI-TECH',
              name: 'HI-Tech',
              timezone: 'Asia/Kolkata',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/faculty-access/campuses/')) {
        return facultyAccessResponse();
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: /HI-Tech/i }));

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Program' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semester setup' }));
    expect(
      await screen.findByRole('heading', { name: 'Semester calendar' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add semester' }));
    expect(
      screen.getByRole('heading', { name: 'Create semester' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester import' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semester import' }));
    expect(screen.queryByRole('button', { name: 'Import course data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Semester setup template' })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Update calendar from file' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download Excel template' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('2. Upload calendar')).toHaveAttribute('accept', '.pdf,.xlsx,.csv');
    expect(
      screen.queryByRole('heading', { name: 'Log today’s classes' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'User access' }));
    expect(await screen.findByRole('heading', {name: 'User access'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Add new'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Timetable'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Lesson plans'})).not.toBeInTheDocument();
  });

  it('asks administrators to choose a campus before opening the full workspace', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return userResponse('ADMIN');
      if (url.endsWith('/academic/campuses')) {
        return new Response(
          JSON.stringify([
            {
              id: 'campus-a',
              code: 'HI-TECH',
              name: 'HI-Tech Campus',
              timezone: 'Asia/Kolkata',
            },
            {
              id: 'campus-b',
              code: 'RATHINAM',
              name: 'Rathinam Campus',
              timezone: 'Asia/Kolkata',
            },
            {
              id: 'campus-c',
              code: 'JAGGANNATH',
              name: 'Jaggannath Campus',
              timezone: 'Asia/Kolkata',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/academic/subjects?campusId=campus-a')) {
        return new Response(JSON.stringify([{ id: 'subject', name: 'DSA', code: 'CS-DSA', active: true, description: null, offerings: [{ id: 'offering', batch: { name: 'Section A', semester: { name: 'Sem 1' } }, faculty: [] }] }]), { headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/faculty-access/campuses/')) {
        return facultyAccessResponse();
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Yatharth' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('3 active campuses')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Rathinam Campus/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Jaggannath Campus/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Semester setup' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /HI-Tech Campus/i }));

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Yatharth' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Change campus/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Semester setup' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semester setup' }));
    expect(
      await screen.findByRole('heading', { name: 'Semester calendar' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Campus')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subjects' }));
    expect(await screen.findByRole('button', { name: 'Assign teacher' })).toBeInTheDocument();
    expect(screen.getByText('Section A')).toBeInTheDocument();
    expect(screen.getByText('Sem 1')).toBeInTheDocument();
  });

  it('gives campus managers timetable access without global setup tools', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return userResponse('CAMPUS_MANAGER');
      if (url.endsWith('/academic/campuses')) {
        return new Response(
          JSON.stringify([
            {
              id: 'campus-a',
              code: 'HI-TECH',
              name: 'HI-Tech',
              timezone: 'Asia/Kolkata',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/faculty-access/campuses/')) {
        return facultyAccessResponse();
      }
      if (url.endsWith('/missed-log-alerts/me')) {
        return new Response(
          JSON.stringify({
            summary: {
              total: 0,
              facultyReminders: 0,
              managerEscalations: 0,
              failed: 0,
            },
            alerts: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Campus' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'User access' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Timetable' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lesson plans' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planned dates' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Campus semesters' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Log today’s classes' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester import' }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'AI insights' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'User access' }));
    expect(
      await screen.findByRole('heading', {
        name: 'User access',
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Weekly timetable' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Timetable' }));
    expect(
      await screen.findByRole('heading', { name: 'Weekly timetable' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'User access', level: 2 }),
    ).not.toBeInTheDocument();
  });
});

function facultyAccessResponse() {
  return new Response(
    JSON.stringify({
      campus: {
        id: 'campus-a',
        code: 'HI-TECH',
        name: 'HI-Tech',
        timezone: 'Asia/Kolkata',
        active: true,
      },
      faculty: [],
      offerings: [],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
