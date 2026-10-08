export type UserRole =
  'ADMIN' | 'PROGRAM_MANAGER' | 'CAMPUS_MANAGER' | 'FACULTY' | 'STUDENT';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  roles: Array<{ role: UserRole; campusId: string | null }>;
  staffProfileId: string | null;
  studentProfile: { id: string; batchId: string } | null;
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(body?.message)) return body.message.join(' ');
  return body?.message ?? 'The request could not be completed.';
}

export async function loadCurrentUser(): Promise<AuthenticatedUser | null> {
  const response = await fetch(`${apiUrl}/auth/me`, {
    credentials: 'include',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await messageFrom(response));
  const body = (await response.json()) as { user: AuthenticatedUser };
  return body.user;
}

export async function login(email: string, password: string) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  const body = (await response.json()) as { user: AuthenticatedUser };
  return body.user;
}

export async function logout() {
  const response = await fetch(`${apiUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(await messageFrom(response));
  }
}
