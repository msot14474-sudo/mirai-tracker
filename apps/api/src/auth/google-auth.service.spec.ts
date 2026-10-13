import { GoogleAuthService } from './google-auth.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';

const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest
    .fn()
    .mockImplementation(() => ({
      getToken: mockGetToken,
      verifyIdToken: mockVerifyIdToken,
    })),
}));

describe('Google authentication', () => {
  const savedEnv = { ...process.env };
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    setWithExpiry: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    consumeIfValue: jest.fn(async (key: string, value: string) => {
      if (store.get(key) !== value) return false;
      store.delete(key);
      return true;
    }),
  };
  const auth = {
    loginWithGoogle: jest.fn(async () => ({ token: 'app-session' })),
  };
  const service = () =>
    new GoogleAuthService(
      redis as unknown as RedisService,
      auth as unknown as AuthService,
    );
  beforeEach(() => {
    jest.clearAllMocks();
    store.clear();
    process.env.GOOGLE_CLIENT_ID = 'google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI =
      'https://mirai.example/api/auth/google/callback';
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'signed-token' } });
  });
  afterAll(() => {
    process.env = savedEnv;
  });

  async function flow(payload = {}) {
    const start = await service().start();
    const url = new URL(start.url);
    const state = url.searchParams.get('state')!;
    const nonce = url.searchParams.get('nonce');
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-subject',
        email: 'faculty@gmail.com',
        email_verified: true,
        nonce,
        ...payload,
      }),
    });
    return { start, url, state };
  }

  it('requires configuration and never puts the client secret in the URL', async () => {
    const { start, url } = await flow();
    expect(start.url).not.toContain('test-secret');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(start.cookie).toContain('HttpOnly; SameSite=Lax');
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(service().enabled).toBe(false);
    await expect(service().start()).rejects.toThrow('not configured');
  });

  it('rejects a callback without the initiating browser cookie', async () => {
    const { state } = await flow();
    await expect(service().finish('code', state, undefined)).rejects.toThrow(
      'same browser',
    );
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('verifies audience and nonce, consumes state once, then uses the existing account', async () => {
    const { state, start } = await flow();
    await expect(
      service().finish('code', state, start.cookie),
    ).resolves.toEqual({ token: 'app-session' });
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'signed-token',
      audience: 'google-client',
    });
    expect(auth.loginWithGoogle).toHaveBeenCalledWith('faculty@gmail.com');
    await expect(service().finish('code', state, start.cookie)).rejects.toThrow(
      'expired',
    );
    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it.each([
    { nonce: 'wrong-nonce' },
    { email_verified: false },
    { sub: undefined },
    { email: 'faculty@external-provider.example', hd: undefined },
  ])('rejects untrusted identity claims %j', async (payload) => {
    const { state, start } = await flow(payload);
    await expect(
      service().finish('code', state, start.cookie),
    ).rejects.toThrow();
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature or expired token', async () => {
    const { state, start } = await flow();
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
    await expect(
      service().finish('code', state, start.cookie),
    ).rejects.toThrow();
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('accepts a verified Google Workspace email', async () => {
    const { state, start } = await flow({
      email: 'faculty@college.edu',
      hd: 'college.edu',
    });
    await service().finish('code', state, start.cookie);
    expect(auth.loginWithGoogle).toHaveBeenCalledWith('faculty@college.edu');
  });
});
