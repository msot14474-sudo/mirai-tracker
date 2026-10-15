import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacultyAccessWorkspace } from './FacultyAccessWorkspace';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWorkspace(
  props: {
    canCreateCampusManagers?: boolean;
    canCreateAdministrators?: boolean;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FacultyAccessWorkspace {...props} />
    </QueryClientProvider>,
  );
}

describe('FacultyAccessWorkspace', () => {
  it('lets a campus manager create faculty access and choose subject scope', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, body: init?.body?.toString() });
      if (url.endsWith('/academic/campuses')) {
        return response([
          {
            id: 'campus-a',
            code: 'HI-TECH',
            name: 'HI-Tech',
            timezone: 'Asia/Kolkata',
          },
        ]);
      }
      if (init?.method === 'POST') return response({ assignedOfferings: 1 });
      return response({
        campus: {
          id: 'campus-a',
          code: 'HI-TECH',
          name: 'HI-Tech',
          timezone: 'Asia/Kolkata',
          active: true,
        },
        faculty: [],
        offerings: [
          {
            id: 'offering-a',
            subject: { code: 'CS-DSA', name: 'Data Structures' },
            batch: {
              code: 'MIRAI-A',
              name: 'Mirai A',
              semester: {
                id: 'semester-a',
                name: 'Semester 2026',
                startDate: '2026-07-01',
                endDate: '2026-12-15',
              },
            },
          },
        ],
      });
    });

    renderWorkspace();
    expect(
      await screen.findByRole('heading', { name: 'User access' }),
    ).toBeInTheDocument();
    const offering = await screen.findByLabelText(/CS-DSA/);
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Dr Asha' },
    });
    fireEvent.change(screen.getByLabelText('Login email'), {
      target: { value: 'asha@example.edu' },
    });
    fireEvent.change(screen.getByLabelText('Employee code'), {
      target: { value: 'FAC-101' },
    });
    fireEvent.change(screen.getByLabelText(/Account password/), {
      target: { value: 'a-strong-temporary-password' },
    });
    fireEvent.click(offering);
    fireEvent.click(
      screen.getByRole('button', { name: 'Create faculty access' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Faculty access created',
    );
    await waitFor(() => {
      const post = requests.find((request) => request.body);
      expect(post).toBeDefined();
      expect(JSON.parse(post!.body!)).toMatchObject({
        name: 'Dr Asha',
        email: 'asha@example.edu',
        employeeCode: 'FAC-101',
        offeringIds: ['offering-a'],
      });
    });
  });

  it('lets an administrator create campus managers and administrators', async () => {
    const requests: Array<{
      url: string;
      method?: string;
      body?: string;
    }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        method: init?.method,
        body: init?.body?.toString(),
      });
      if (url.endsWith('/academic/campuses')) {
        return response([
          {
            id: 'campus-a',
            code: 'HI-TECH',
            name: 'HI-Tech',
            timezone: 'Asia/Kolkata',
          },
        ]);
      }
      if (init?.method === 'POST')
        return response({ account: { id: 'user-b' } });
      return response({
        campus: {
          id: 'campus-a',
          code: 'HI-TECH',
          name: 'HI-Tech',
          timezone: 'Asia/Kolkata',
          active: true,
        },
        faculty: [],
        offerings: [],
      });
    });

    renderWorkspace({
      canCreateCampusManagers: true,
      canCreateAdministrators: true,
    });
    await screen.findByRole('heading', { name: 'User access' });

    fireEvent.click(screen.getByRole('button', { name: 'Campus Manager' }));
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'New Campus Manager' },
    });
    fireEvent.change(screen.getByLabelText('Login email'), {
      target: { value: 'campus.manager@example.edu' },
    });
    fireEvent.change(screen.getByLabelText(/Account password/), {
      target: { value: 'a-strong-temporary-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create campus manager' }),
    );
    expect(
      await screen.findByText('Campus Manager access created.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Administrator' }));
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'New Administrator' },
    });
    fireEvent.change(screen.getByLabelText('Login email'), {
      target: { value: 'new.admin@example.edu' },
    });
    fireEvent.change(screen.getByLabelText(/Account password/), {
      target: { value: 'another-strong-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create administrator' }),
    );
    expect(
      await screen.findByText('Administrator access created.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      const posts = requests.filter((request) => request.method === 'POST');
      expect(posts).toHaveLength(2);
      expect(posts[0]?.url).toContain('/campuses/campus-a/managers');
      expect(posts[1]?.url).toContain('/faculty-access/administrators');
      expect(JSON.parse(posts[0]!.body!)).toMatchObject({
        name: 'New Campus Manager',
        email: 'campus.manager@example.edu',
      });
      expect(JSON.parse(posts[1]!.body!)).toMatchObject({
        name: 'New Administrator',
        email: 'new.admin@example.edu',
      });
    });
  });

  it('lets a campus manager securely update a managed student account', async () => {
    const requests: Array<{ url: string; method?: string; body?: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        method: init?.method,
        body: init?.body?.toString(),
      });
      if (url.endsWith('/academic/campuses')) {
        return response([
          {
            id: 'campus-a',
            code: 'HI-TECH',
            name: 'HI-Tech',
            timezone: 'Asia/Kolkata',
          },
        ]);
      }
      if (url.endsWith('/faculty-access/campuses/campus-a/accounts')) {
        return response({
          accounts: [
            {
              id: 'student-user-a',
              name: 'Student One',
              email: 'student@example.edu',
              notificationEmail: null,
              status: 'ACTIVE',
              roleAssignments: [
                {
                  role: 'STUDENT',
                  campusId: 'campus-a',
                  campus: { name: 'HI-Tech' },
                },
              ],
              staffProfile: null,
              studentProfile: {
                studentCode: 'STU-101',
                enrollmentStatus: 'ACTIVE',
                batch: { code: 'MIRAI-A', name: 'Mirai A' },
              },
            },
          ],
        });
      }
      if (init?.method === 'PATCH') {
        return response({
          account: { id: 'student-user-a' },
          passwordChanged: true,
        });
      }
      return response({
        campus: {
          id: 'campus-a',
          code: 'HI-TECH',
          name: 'HI-Tech',
          timezone: 'Asia/Kolkata',
          active: true,
        },
        faculty: [],
        offerings: [],
      });
    });

    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: /Student One/ }));
    fireEvent.change(screen.getByLabelText(/New password/), {
      target: { value: 'a-new-student-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save account changes' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Account changes saved securely',
    );
    const update = requests.find((request) => request.method === 'PATCH');
    expect(update?.url).toContain('/faculty-access/accounts/student-user-a');
    expect(JSON.parse(update!.body!)).toMatchObject({
      name: 'Student One',
      email: 'student@example.edu',
      password: 'a-new-student-password',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete access' }));
    expect(
      requests.filter((request) => request.method === 'PATCH'),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm delete access' }),
    );
    await waitFor(() =>
      expect(
        requests.filter((request) => request.method === 'PATCH'),
      ).toHaveLength(2),
    );
    const revoked = requests.filter((request) => request.method === 'PATCH')[1];
    expect(JSON.parse(revoked!.body!)).toEqual({ status: 'SUSPENDED' });
  });
});
