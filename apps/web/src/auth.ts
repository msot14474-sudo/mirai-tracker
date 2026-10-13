import { advanceSessionGeneration, apiFetch, apiUrl } from './http';
export type UserRole =
  'ADMIN' | 'PROGRAM_MANAGER' | 'CAMPUS_MANAGER' | 'FACULTY' | 'STUDENT';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  notificationEmail?: string | null;
  roles: Array<{ role: UserRole; campusId: string | null }>;
  staffProfileId: string | null;
  studentProfile: { id: string; batchId: string } | null;
};

export type UpdateOwnAccountInput = {
  name?: string;
  notificationEmail?: string | null;
  currentPassword?: string;
  newPassword?: string;
};

export type LoginChallenge = {
  challengeId: string;
  expiresInSeconds: number;
  destination: string;
};

export type PasswordResetChallenge = {
  challengeId: string;
  expiresInSeconds: number;
};

export type PasswordResetApproval = {
  resetToken: string;
  expiresInSeconds: number;
};

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(body?.message)) return body.message.join(' ');
  return body?.message ?? 'The request could not be completed.';
}

export async function loadCurrentUser(): Promise<AuthenticatedUser | null> {
  const response = await apiFetch(`${apiUrl}/auth/me`, {
    credentials: 'include',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await messageFrom(response));
  const body = (await response.json()) as { user: AuthenticatedUser };
  return body.user;
}

export async function updateOwnAccount(input: UpdateOwnAccountInput) {
  const response = await apiFetch(`${apiUrl}/auth/account`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  const body = (await response.json()) as { user: AuthenticatedUser };
  return body.user;
}

export async function login(email: string, password: string) {
  const response = await apiFetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  return response.json() as Promise<LoginChallenge>;
}

export async function verifyOtp(challengeId: string, code: string) {
  const response = await apiFetch(`${apiUrl}/auth/verify-otp`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code }),
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  const body = (await response.json()) as { user: AuthenticatedUser };
  advanceSessionGeneration();
  return body.user;
}

export async function requestPasswordReset(email: string) {
  const response = await apiFetch(`${apiUrl}/auth/forgot-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  return response.json() as Promise<PasswordResetChallenge>;
}

export async function verifyPasswordResetOtp(
  challengeId: string,
  code: string,
) {
  const response = await apiFetch(`${apiUrl}/auth/verify-reset-otp`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code }),
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  return response.json() as Promise<PasswordResetApproval>;
}

export async function resetPassword(resetToken: string, password: string) {
  const response = await apiFetch(`${apiUrl}/auth/reset-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToken, password }),
  });
  if (!response.ok) throw new Error(await messageFrom(response));
}

export async function logout() {
  const response = await apiFetch(`${apiUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  advanceSessionGeneration();
  if (!response.ok && response.status !== 401) {
    throw new Error(await messageFrom(response));
  }
}
