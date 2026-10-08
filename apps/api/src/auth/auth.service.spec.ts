import { UserRole, UserStatus } from '@prisma/client';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

describe('AuthService', () => {
  const findUnique = jest.fn();
  const createAuditEvent = jest.fn();
  const sendLoginOtp = jest.fn();
  const store = new Map<string, string>();
  const prisma = {
    user: { findUnique },
    auditEvent: { create: createAuditEvent },
  };
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setWithExpiry: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    consumeIfValue: jest.fn((key: string, expectedValue: string) => {
      if (store.get(key) !== expectedValue) return Promise.resolve(false);
      store.delete(key);
      return Promise.resolve(true);
    }),
    incrementWithExpiry: jest.fn().mockResolvedValue(1),
  };
  const email = { sendLoginOtp };

  beforeEach(() => {
    jest.clearAllMocks();
    store.clear();
    process.env.SESSION_SECRET = 'test-session-secret';
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(store.get(key) ?? null),
    );
    redis.incrementWithExpiry.mockResolvedValue(1);
    redis.consumeIfValue.mockImplementation(
      (key: string, expectedValue: string) => {
        if (store.get(key) !== expectedValue) return Promise.resolve(false);
        store.delete(key);
        return Promise.resolve(true);
      },
    );
    createAuditEvent.mockResolvedValue({ id: 'audit-login' });
    sendLoginOtp.mockResolvedValue({ messageId: 'otp-message' });
  });

  async function activeUser(status: UserStatus = UserStatus.ACTIVE) {
    const credential = await hashPassword('correct-password');
    return {
      id: 'user-a',
      name: 'Faculty A',
      email: 'faculty@mirai.local',
      notificationEmail: 'faculty@example.edu',
      status,
      passwordCredential: credential,
      roleAssignments: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
      staffProfile: { id: 'faculty-a' },
      studentProfile: null,
    };
  }

  function service() {
    return new AuthService(prisma as never, redis as never, email as never);
  }

  it('emails a short-lived code after valid credentials without creating a session', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());

    const result = await service().login(
      '  FACULTY@MIRAI.LOCAL ',
      'correct-password',
    );

    expect(result.challengeId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result).toMatchObject({
      expiresInSeconds: 600,
      destination: 'f******@example.edu',
    });
    expect(sendLoginOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'faculty@example.edu',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
    const sentCode = sendLoginOtp.mock.calls[0][0].code as string;
    const challengeWrite = redis.setWithExpiry.mock.calls.find(([key]) =>
      String(key).startsWith('auth:otp-challenge:'),
    );
    expect(redis.setWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:otp-challenge:/),
      expect.any(String),
      600,
    );
    expect(String(challengeWrite?.[1])).not.toContain(sentCode);
    expect(
      redis.setWithExpiry.mock.calls.some(([key]) =>
        String(key).startsWith('auth:session:'),
      ),
    ).toBe(false);
  });

  it('creates an opaque session only after the correct code', async () => {
    const record = await activeUser();
    findUnique.mockResolvedValueOnce(record);
    const auth = service();
    const challenge = await auth.login(
      'faculty@mirai.local',
      'correct-password',
    );
    const code = sendLoginOtp.mock.calls[0][0].code as string;
    const {
      passwordCredential: _credential,
      notificationEmail: _email,
      ...user
    } = record;
    findUnique.mockResolvedValueOnce(user);

    const result = await auth.verifyOtp(challenge.challengeId, code);

    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.user.roles[0]?.role).toBe(UserRole.FACULTY);
    expect(redis.setWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
      'user-a',
      28_800,
    );
    expect(createAuditEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-a',
        metadata: { authenticationMethod: 'password_email_otp' },
      }),
    });
    await expect(
      auth.verifyOtp(challenge.challengeId, code),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect or expired code without creating a session', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    const auth = service();
    const challenge = await auth.login(
      'faculty@mirai.local',
      'correct-password',
    );

    await expect(
      auth.verifyOtp(challenge.challengeId, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.verifyOtp('missing-challenge', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      redis.setWithExpiry.mock.calls.some(([key]) =>
        String(key).startsWith('auth:session:'),
      ),
    ).toBe(false);
  });

  it('removes the challenge when email delivery fails', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    sendLoginOtp.mockRejectedValueOnce(new Error('smtp unavailable'));

    await expect(
      service().login('faculty@mirai.local', 'correct-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect([...store.keys()].some((key) => key.includes('otp-challenge'))).toBe(
      false,
    );
  });

  it('returns the same generic error for a wrong password', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());

    await expect(
      service().login('faculty@mirai.local', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sendLoginOtp).not.toHaveBeenCalled();
  });

  it('temporarily blocks the fifth failed password attempt', async () => {
    findUnique.mockResolvedValue(null);
    redis.incrementWithExpiry.mockResolvedValue(5);

    await expect(
      service().login('unknown@mirai.local', 'wrong-password'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('limits OTP requests to three per ten minutes', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    redis.incrementWithExpiry.mockResolvedValueOnce(4);

    await expect(
      service().login('faculty@mirai.local', 'correct-password'),
    ).rejects.toMatchObject({ status: 429 });
    expect(sendLoginOtp).not.toHaveBeenCalled();
  });

  it('invalidates a challenge after five incorrect codes', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    const auth = service();
    const challenge = await auth.login(
      'faculty@mirai.local',
      'correct-password',
    );
    redis.incrementWithExpiry.mockResolvedValueOnce(5);

    await expect(
      auth.verifyOtp(challenge.challengeId, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.verifyOtp(challenge.challengeId, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects suspended users even when the password is correct', async () => {
    findUnique.mockResolvedValueOnce(await activeUser(UserStatus.SUSPENDED));

    await expect(
      service().login('faculty@mirai.local', 'correct-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reloads current roles for every valid session', async () => {
    const record = await activeUser();
    const {
      passwordCredential: _credential,
      notificationEmail: _notificationEmail,
      ...sessionUser
    } = record;
    findUnique.mockResolvedValueOnce(sessionUser);
    const auth = service();
    const token = 'session-token';
    const sessionKey = findSessionKey(auth, token);
    store.clear();
    store.set(sessionKey, 'user-a');

    await expect(auth.userForSession(token)).resolves.toMatchObject({
      id: 'user-a',
      staffProfileId: 'faculty-a',
    });
  });

  it('deletes the server-side session on logout', async () => {
    await service().logout('session-token');
    expect(redis.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
    );
  });

  function findSessionKey(auth: AuthService, token: string) {
    return (
      auth as unknown as { sessionKey(value: string): string }
    ).sessionKey(token);
  }
});
