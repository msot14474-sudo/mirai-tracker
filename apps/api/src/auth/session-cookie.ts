import { SESSION_COOKIE_NAME } from './auth.constants';

export function readSessionCookie(header: string | undefined) {
  if (!header) return null;

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === SESSION_COOKIE_NAME) {
      const value = rawValue.join('=');
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export function createSessionCookie(token: string, maxAgeSeconds: number) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}

export function clearSessionCookie() {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}
