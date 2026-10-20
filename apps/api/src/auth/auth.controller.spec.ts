import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

describe('Password sign-in responses', () => {
  const login = jest.fn();
  const response = { setHeader: jest.fn() };
  const controller = () =>
    new AuthController(
      { login, sessionCookieMaxAgeSeconds: 3600 } as unknown as AuthService,
      {} as GoogleAuthService,
    );
  beforeEach(() => jest.clearAllMocks());

  it('sets the session in an HttpOnly cookie without returning the token to JavaScript', async () => {
    const user = {
      id: 'demo-faculty',
      roles: [{ role: 'FACULTY', campusId: 'campus-a' }],
    };
    login.mockResolvedValueOnce({ token: 'private-session', user });
    const result = await controller().login(
      { email: 'faculty@mirai.local', password: 'valid-password' },
      response,
    );
    expect(result).toEqual({ user });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('HttpOnly'),
    );
    expect(JSON.stringify(result)).not.toContain('private-session');
  });

  it('keeps ordinary accounts at the challenge step without a session cookie', async () => {
    const challenge = {
      challengeId: 'otp-challenge',
      expiresInSeconds: 600,
      destination: 'f***@example.edu',
    };
    login.mockResolvedValueOnce(challenge);
    expect(
      await controller().login(
        { email: 'faculty@mirai.local', password: 'valid-password' },
        response,
      ),
    ).toEqual(challenge);
    expect(response.setHeader).not.toHaveBeenCalledWith(
      'Set-Cookie',
      expect.anything(),
    );
  });
});
