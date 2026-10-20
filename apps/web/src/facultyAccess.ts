import { apiFetch, apiUrl } from './http';
import { Campus } from './academic';

export type FacultyAccessDetail = {
  campus: Campus & { active: boolean };
  faculty: Array<{
    id: string;
    employeeCode: string;
    staffType: 'REGULAR' | 'VISITING';
    active: boolean;
    user: {
      id: string;
      name: string;
      email: string;
      notificationEmail: string | null;
      status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    };
    facultyAssignments: Array<{
      id: string;
      type: 'PRIMARY' | 'CO_FACULTY' | 'VISITING';
      offering: {
        id: string;
        subject: { code: string; name: string };
        batch: { code: string; name: string };
      };
    }>;
  }>;
  offerings: Array<{
    id: string;
    subject: { code: string; name: string };
    batch: {
      code: string;
      name: string;
      semester: {
        id: string;
        name: string;
        startDate: string;
        endDate: string;
      };
    };
  }>;
};

export type CreateFacultyInput = {
  name: string;
  email: string;
  notificationEmail: string | null;
  employeeCode: string;
  staffType: 'REGULAR' | 'VISITING';
  password: string;
  offeringIds: string[];
};

export type CreateAccessAccountInput = Pick<
  CreateFacultyInput,
  'name' | 'email' | 'notificationEmail' | 'password'
>;

export type ManagedAccount = {
  id: string;
  name: string;
  email: string;
  notificationEmail: string | null;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  roleAssignments: Array<{
    role:
      'ADMIN' | 'PROGRAM_MANAGER' | 'CAMPUS_MANAGER' | 'FACULTY' | 'STUDENT';
    campusId: string | null;
    campus: { name: string } | null;
  }>;
  staffProfile: {
    employeeCode: string;
    staffType: 'REGULAR' | 'VISITING';
    active: boolean;
  } | null;
  studentProfile: {
    studentCode: string;
    enrollmentStatus: string;
    batch: { id?: string; code: string; name: string; semester?: { name: string; campus: { name: string } } };
  } | null;
};

export type UpdateManagedAccountInput = {
  studentBatchId?: string;
  role?: ManagedAccount['roleAssignments'][number]['role'];
  campusId?: string | null;
  name?: string;
  email?: string;
  notificationEmail?: string | null;
  status?: 'ACTIVE' | 'SUSPENDED';
  password?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      errors?: Array<{ message: string }>;
    } | null;
    const validation = body?.errors?.map((error) => error.message).join(' ');
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : body?.message;
    throw new Error(
      validation ?? message ?? 'Faculty access could not be saved.',
    );
  }
  return response.json() as Promise<T>;
}

export const facultyAccessApi = {
  network: () =>
    api<
      Array<{
        id: string;
        name: string;
        managerCount: number;
        facultyCount: number;
        people: Array<{
          id: string;
          name: string;
          role: string;
          status: string;
          defaultSubjects?: Array<{id: string; name: string}>;
          subjects: Array<{
            offeringId: string;
            subject: string;
            batch: string;
            semester: string;
          }>;
        }>;
      }>
    >('/faculty-access/network'),
  campus: (campusId: string) =>
    api<FacultyAccessDetail>(`/faculty-access/campuses/${campusId}`),
  create: (campusId: string, input: CreateFacultyInput) =>
    api<{ assignedOfferings: number }>(
      `/faculty-access/campuses/${campusId}/faculty`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  createCampusManager: (campusId: string, input: CreateAccessAccountInput) =>
    api<{ role: 'CAMPUS_MANAGER'; campusId: string }>(
      `/faculty-access/campuses/${campusId}/managers`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  createAdministrator: (input: CreateAccessAccountInput) =>
    api<{ role: 'ADMIN'; campusId: null }>('/faculty-access/administrators', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  accounts: (campusId: string) =>
    api<{ accounts: ManagedAccount[] }>(
      `/faculty-access/campuses/${campusId}/accounts`,
    ),
  updateAccount: (userId: string, input: UpdateManagedAccountInput) =>
    api<{ account: ManagedAccount; passwordChanged: boolean }>(
      `/faculty-access/accounts/${userId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
};
