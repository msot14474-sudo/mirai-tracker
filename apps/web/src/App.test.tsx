import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
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
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('faculty@mirai.local');
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
      return new Response(null, { status: 401 });
    });
    renderApp();

    fireEvent.change(await screen.findByLabelText('Password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with email code' }),
    );

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

    fireEvent.click(screen.getByRole('button', { name: 'Academic setup' }));
    expect(
      await screen.findByRole('heading', { name: 'Semester calendar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Create semester' }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByRole('option', { name: 'HI-Tech' })).length,
    ).toBe(1);
    expect(
      screen.queryByRole('heading', { name: 'Semester import' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semester import' }));
    expect(
      await screen.findByRole('heading', { name: 'Semester import' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Download Excel template' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/imports/template?format=xlsx'),
    );
    expect(
      screen.queryByRole('heading', { name: 'Log today’s classes' }),
    ).not.toBeInTheDocument();
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
      screen.queryByRole('button', { name: 'Academic setup' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /HI-Tech Campus/i }));

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Yatharth' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Change campus/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Academic setup' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Academic setup' }));
    expect(
      await screen.findByRole('heading', { name: 'Semester calendar' }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Campus')).not.toHaveLength(0);
    screen
      .getAllByLabelText('Campus')
      .forEach((campusSelect) => expect(campusSelect).toBeDisabled());
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
      screen.getByRole('button', { name: 'Faculty access' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Timetable' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Log today’s classes' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester calendar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Semester import' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Faculty access' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Faculty access',
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
      screen.queryByRole('heading', { name: 'Faculty access', level: 2 }),
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
