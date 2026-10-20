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
    currentUserId?: string;
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
      if (url.endsWith('/faculty-access/network'))
        return response([
          {
            id: 'campus-a',
            name: 'HI-Tech',
            managerCount: 1,
            facultyCount: 1,
            people: [
              {
                id: 'connected-teacher',
                name: 'Connected teacher',
                role: 'FACULTY',
                status: 'ACTIVE',
                subjects: [
                  {
                    offeringId: 'connected-subject',
                    subject: 'Connected subject',
                    batch: 'Batch A',
                    semester: 'Semester 1',
                  },
                ],
              },
            ],
          },
        ]);
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
    expect(await screen.findByText('Connected teacher')).toBeInTheDocument();
    expect(
      screen.getByText('Connected subject · Batch A · Semester 1'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'User access' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Add faculty' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
    fireEvent.change(screen.getByLabelText('Faculty campus'), {
      target: { value: 'campus-a' },
    });
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
      if (url.endsWith('/faculty-access/network'))
        return response([
          {
            id: 'campus-a',
            name: 'HI-Tech',
            managerCount: 1,
            facultyCount: 1,
            people: [
              {
                id: 'connected-teacher',
                name: 'Connected teacher',
                role: 'FACULTY',
                status: 'ACTIVE',
                subjects: [
                  {
                    offeringId: 'connected-subject',
                    subject: 'Connected subject',
                    batch: 'Batch A',
                    semester: 'Semester 1',
                  },
                ],
              },
            ],
          },
        ]);
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
          {
            id: 'campus-b',
            code: 'SECOND',
            name: 'Second Campus',
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

    fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Campus Manager' }),
    );
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'New Campus Manager' },
    });
    fireEvent.change(screen.getByLabelText('Login email'), {
      target: { value: 'campus.manager@example.edu' },
    });
    fireEvent.change(screen.getByLabelText(/Account password/), {
      target: { value: 'a-strong-temporary-password' },
    });
    expect(
      screen.getByRole('button', { name: 'Create campus manager' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Assigned campus'), {
      target: { value: 'campus-b' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create campus manager' }),
    );
    expect(
      await screen.findByText('Campus Manager access assigned.'),
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
      await screen.findByText('Administrator access assigned.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      const posts = requests.filter((request) => request.method === 'POST');
      expect(posts).toHaveLength(2);
      expect(posts[0]?.url).toContain('/campuses/campus-b/managers');
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
      if (url.endsWith('/faculty-access/network'))
        return response([
          {
            id: 'campus-a',
            name: 'HI-Tech',
            managerCount: 1,
            facultyCount: 1,
            people: [
              {
                id: 'connected-teacher',
                name: 'Connected teacher',
                role: 'FACULTY',
                status: 'ACTIVE',
                subjects: [
                  {
                    offeringId: 'connected-subject',
                    subject: 'Connected subject',
                    batch: 'Batch A',
                    semester: 'Semester 1',
                  },
                ],
              },
            ],
          },
        ]);
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
      if (url.endsWith('/academic/campuses/campus-a/semesters')) return response([{ id: 'semester-a', name: 'Semester 1', status: 'ACTIVE' }]);
      if (url.includes('/academic/semesters/semester-a/')) return response([{ id: 'batch-a', name: 'First Year A', code: 'YEAR1-A' }]);
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
    fireEvent.click(
      await screen.findByRole('button', { name: /^Student One/ }),
    );
    await screen.findByRole('option', { name: 'Semester 1' });
    fireEvent.change(await screen.findByLabelText('Student semester'), { target: { value: 'semester-a' } });
    await screen.findByRole('option', { name: 'First Year A · YEAR1-A' });
    fireEvent.change(screen.getByLabelText('Student batch'), { target: { value: 'batch-a' } });
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
      studentBatchId: 'batch-a',
      password: 'a-new-student-password',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove access for Student One' }),
    );
    expect(
      requests.filter((request) => request.method === 'PATCH'),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm remove access' }),
    );
    await waitFor(() =>
      expect(
        requests.filter((request) => request.method === 'PATCH'),
      ).toHaveLength(2),
    );
    const revoked = requests.filter((request) => request.method === 'PATCH')[1];
    expect(JSON.parse(revoked!.body!)).toEqual({ status: 'SUSPENDED' });
  });
  it.each(['FACULTY', 'CAMPUS_MANAGER', 'ADMIN', 'STUDENT'])(
    'removes %s access directly from the directory after confirmation',
    async (role) => {
      let status = 'ACTIVE';
      const patches: unknown[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/faculty-access/network'))
          return response([
            {
              id: 'campus-a',
              name: 'HI-Tech',
              managerCount: 1,
              facultyCount: 1,
              people: [
                {
                  id: 'connected-teacher',
                  name: 'Connected teacher',
                  role: 'FACULTY',
                  status: 'ACTIVE',
                  subjects: [
                    {
                      offeringId: 'connected-subject',
                      subject: 'Connected subject',
                      batch: 'Batch A',
                      semester: 'Semester 1',
                    },
                  ],
                },
              ],
            },
          ]);
        if (init?.method === 'PATCH') {
          patches.push(JSON.parse(String(init.body)));
          status = 'SUSPENDED';
          return response({
            account: { id: 'target' },
            passwordChanged: false,
          });
        }
        if (url.endsWith('/academic/campuses'))
          return response([
            {
              id: 'campus-a',
              name: 'Campus',
              code: 'A',
              timezone: 'Asia/Kolkata',
            },
          ]);
        if (url.endsWith('/accounts'))
          return response({
            accounts: [
              {
                id: 'target',
                name: 'Test Person',
                email: 'person@example.edu',
                status,
                roleAssignments: [
                  { role, campusId: 'campus-a', campus: { name: 'Campus' } },
                ],
                staffProfile: null,
                studentProfile: null,
              },
            ],
          });
        return response({
          campus: { id: 'campus-a' },
          faculty: [],
          offerings: [],
        });
      });
      renderWorkspace({
        currentUserId: 'actor',
        canCreateAdministrators: true,
      });
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Remove access for Test Person',
        }),
      );
      expect(patches).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(patches).toEqual([]);
      fireEvent.click(
        screen.getByRole('button', { name: 'Remove access for Test Person' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm remove access' }),
      );
      await waitFor(() => expect(patches).toEqual([{ status: 'SUSPENDED' }]));
      expect(await screen.findByText('Access removed')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Remove access for Test Person' }),
      ).not.toBeInTheDocument();
    },
  );
});
