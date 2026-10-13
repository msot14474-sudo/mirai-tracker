import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

describe('Google sign-in endpoints', () => {
  const google = {
    enabled: false,
    start: jest.fn(),
    finish: jest.fn(),
    cookie: jest.fn(() => 'state=; Max-Age=0'),
  };
  const auth = { sessionCookieMaxAgeSeconds: 3600 };
  const response = { setHeader: jest.fn(), redirect: jest.fn() };
  const controller = () =>
    new AuthController(
      auth as AuthService,
      google as unknown as GoogleAuthService,
    );
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('returns only availability, with a usable fallback when configuration is absent', async () => {
    expect(controller().googleConfig()).toEqual({ enabled: false });
    google.start.mockRejectedValueOnce(new Error('Missing config'));
    await controller().startGoogle(response);
    expect(response.redirect).toHaveBeenCalledWith(
      process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    );
    expect(JSON.stringify(response.redirect.mock.calls)).not.toContain(
      'google_error',
    );
  });
  it('sets an HttpOnly session cookie after verification, without exposing it in the redirect', async () => {
    google.finish.mockResolvedValueOnce({ token: 'private-session' });
    await controller().finishGoogle('code', 'state', 'cookie', response);
    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      expect.any(String),
      expect.stringContaining('mirai_google_notice=;'),
      expect.stringContaining('HttpOnly'),
    ]);
    expect(response.redirect.mock.calls[0][0]).not.toContain('private-session');
  });
  it('clears OAuth state and returns a generic error on failure without leaking provider details', async () => {
    google.finish.mockRejectedValueOnce(
      new Error('sensitive provider details'),
    );
    await controller().finishGoogle('code', 'state', 'cookie', response);
    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      'state=; Max-Age=0',
      expect.stringContaining('mirai_google_notice=failed;'),
    ]);
    expect(response.redirect).toHaveBeenCalledWith(
      process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    );
    expect(JSON.stringify(response.redirect.mock.calls)).not.toContain(
      'sensitive',
    );
  });
});
