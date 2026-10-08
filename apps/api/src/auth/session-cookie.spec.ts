import {
  clearSessionCookie,
  createSessionCookie,
  readSessionCookie,
} from './session-cookie';

describe('session cookie', () => {
  it('reads the Mirai session from a multi-cookie header', () => {
    expect(
      readSessionCookie('theme=dark; mirai_session=token%2Dvalue; locale=en'),
    ).toBe('token-value');
  });

  it('creates an HTTP-only same-site cookie', () => {
    const cookie = createSessionCookie('secret-token', 3600);
    expect(cookie).toContain('mirai_session=secret-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('clears the browser cookie immediately', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});
