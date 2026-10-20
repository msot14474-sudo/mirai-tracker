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
  const sendPasswordResetOtp = jest.fn();
  const upsertPassword = jest.fn();
  const updateUser = jest.fn();
  const store = new Map<string, string>();
  const prisma = {
    user: { findUnique },
    passwordCredential: { upsert: upsertPassword },
    auditEvent: { create: createAuditEvent },
    $transaction: jest.fn(
      (
        work:
          | Array<Promise<unknown>>
          | ((transaction: {
              user: { update: typeof updateUser };
              auditEvent: { create: typeof createAuditEvent };
            }) => Promise<unknown>),
      ) =>
        typeof work === 'function'
          ? work({
              user: { update: updateUser },
              auditEvent: { create: createAuditEvent },
            })
          : Promise.all(work),
    ),
  };
  const redis = {
    setPersistent: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getPersistent: jest.fn((key: string) =>
      Promise.resolve(store.get(key) ?? null),
    ),
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
  const email = { sendLoginOtp, sendPasswordResetOtp };

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
    sendPasswordResetOtp.mockResolvedValue({ messageId: 'reset-message' });
    upsertPassword.mockResolvedValue({ id: 'credential-a' });
  });

  async function activeUser(status: UserStatus = UserStatus.ACTIVE) {
    const credential = await hashPassword('correct-password');
    return {
      id: 'user-a',
      name: 'Faculty A',
      email: 'faculty@mirai.local',
      notificationEmail: 'faculty@example.edu',
      loginOtpRequired: true,
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

  async function loginWithOtp(
    auth: AuthService,
    email: string,
    password: string,
  ) {
    const result = await auth.login(email, password);
    if (!('challengeId' in result))
      throw new Error('Expected an OTP challenge');
    return result;
  }

  it('creates an audited session after a valid password for an explicitly exempt account', async () => {
    findUnique.mockResolvedValueOnce({
      ...(await activeUser()),
      loginOtpRequired: false,
    });
    const result = await service().login(
      'faculty@mirai.local',
      'correct-password',
    );
    expect(result).toMatchObject({
      token: expect.any(String),
      user: { id: 'user-a' },
    });
    expect(sendLoginOtp).not.toHaveBeenCalled();
    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
    expect(redis.setPersistent).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
      'user-a',
    );
    expect(createAuditEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { authenticationMethod: 'password' },
      }),
    });
  });

  it('still requires OTP for an ordinary account sharing the demo notification inbox', async () => {
    findUnique.mockResolvedValueOnce({
      ...(await activeUser()),
      notificationEmail: 'msot14474@gmail.com',
    });
    await loginWithOtp(service(), 'faculty@mirai.local', 'correct-password');
    expect(sendLoginOtp).toHaveBeenCalled();
    expect(redis.setPersistent).not.toHaveBeenCalled();
  });

  it('retains password and active-account checks for OTP-exempt users', async () => {
    const record = { ...(await activeUser()), loginOtpRequired: false };
    findUnique.mockResolvedValueOnce(record);
    await expect(
      service().login(record.email, 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    findUnique.mockResolvedValueOnce({
      ...record,
      status: UserStatus.SUSPENDED,
    });
    await expect(
      service().login(record.email, 'correct-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.setPersistent).not.toHaveBeenCalled();
    expect(sendLoginOtp).not.toHaveBeenCalled();
  });

  it('keeps password rate limits for OTP-exempt users', async () => {
    findUnique.mockResolvedValue({
      ...(await activeUser()),
      loginOtpRequired: false,
    });
    redis.get.mockResolvedValueOnce('5');
    await expect(
      service().login('faculty@mirai.local', 'correct-password'),
    ).rejects.toMatchObject({ status: 429 });
    expect(redis.setPersistent).not.toHaveBeenCalled();
  });

  it('continues to verify password resets by email for OTP-exempt users', async () => {
    findUnique.mockResolvedValueOnce({
      ...(await activeUser()),
      loginOtpRequired: false,
    });
    await service().requestPasswordReset('faculty@mirai.local');
    expect(sendPasswordResetOtp).toHaveBeenCalled();
    expect(redis.setPersistent).not.toHaveBeenCalled();
  });

  it('uses existing account roles for Google and records the authentication method', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    const result = await service().loginWithGoogle('  FACULTY@MIRAI.LOCAL  ');
    expect(result.user.roles).toEqual([
      { role: UserRole.FACULTY, campusId: 'campus-a' },
    ]);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'faculty@mirai.local' } }),
    );
    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { authenticationMethod: 'google' },
        }),
      }),
    );
  });

  it('denies Google access for absent, inactive and unassigned users', async () => {
    for (const user of [
      null,
      { ...(await activeUser()), status: 'INACTIVE' },
      { ...(await activeUser()), roleAssignments: [] },
    ]) {
      findUnique.mockResolvedValueOnce(user);
      await expect(
        service().loginWithGoogle('faculty@gmail.com'),
      ).rejects.toThrow('No active Mirai account');
    }
    expect(createAuditEvent).not.toHaveBeenCalled();
  });

  it('emails a short-lived code after valid credentials without creating a session', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());

    const result = await loginWithOtp(
      service(),
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
    const challenge = await loginWithOtp(
      auth,
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
    expect(
      redis.setWithExpiry.mock.calls.some(([key]) =>
        String(key).startsWith('auth:session:'),
      ),
    ).toBe(false);
    expect(redis.setPersistent).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
      'user-a',
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
    const challenge = await loginWithOtp(
      auth,
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
    const challenge = await loginWithOtp(
      auth,
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

  it('blocks an existing session after access is removed', async () => {
    findUnique.mockResolvedValueOnce(await activeUser(UserStatus.SUSPENDED));
    const auth = service();
    const token = 'removed-access-session';
    const key = findSessionKey(auth, token);
    store.set(key, 'user-a');
    await expect(auth.userForSession(token)).resolves.toBeNull();
    expect(redis.delete).toHaveBeenCalledWith(key);
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
    expect(redis.getPersistent).toHaveBeenCalledWith(sessionKey);
  });

  it('verifies the emailed code before accepting a new password', async () => {
    const record = await activeUser();
    findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ id: record.id, status: UserStatus.ACTIVE })
      .mockResolvedValueOnce({ id: record.id, status: UserStatus.ACTIVE });
    const auth = service();
    const challenge = await auth.requestPasswordReset(record.email);
    const resetCode = sendPasswordResetOtp.mock.calls[0][0].code as string;
    const approval = await auth.verifyPasswordResetOtp(
      challenge.challengeId,
      resetCode,
    );

    await auth.resetPassword({
      resetToken: approval.resetToken,
      password: 'a-new-secure-password',
    });

    expect(sendPasswordResetOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'faculty@example.edu',
        code: expect.stringMatching(/^\d{6}$/),
      }),
    );
    expect(upsertPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: record.id },
        update: expect.objectContaining({
          passwordHash: expect.not.stringContaining('a-new-secure-password'),
          passwordSalt: expect.any(String),
        }),
      }),
    );
    expect(createAuditEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: record.id,
        entityType: 'PasswordCredential',
      }),
    });
    await expect(
      auth.resetPassword({
        resetToken: approval.resetToken,
        password: 'another-secure-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect reset code before showing the password step', async () => {
    const record = await activeUser();
    findUnique.mockResolvedValueOnce(record);
    const auth = service();
    const challenge = await auth.requestPasswordReset(record.email);

    await expect(
      auth.verifyPasswordResetOtp(challenge.challengeId, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(upsertPassword).not.toHaveBeenCalled();
  });

  it('updates the signed-in user name and audits the change', async () => {
    const record = await activeUser();
    const updated = { ...record, name: 'Faculty Updated' };
    findUnique.mockResolvedValueOnce(record);
    updateUser.mockResolvedValueOnce(updated);

    const result = await service().updateOwnAccount(
      {
        id: record.id,
        name: record.name,
        email: record.email,
        notificationEmail: record.notificationEmail,
        roles: record.roleAssignments,
        staffProfileId: record.staffProfile.id,
        studentProfile: null,
      },
      { name: 'Faculty Updated' },
    );

    expect(result.name).toBe('Faculty Updated');
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Faculty Updated' } }),
    );
    expect(createAuditEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: 'OwnAccount' }),
    });
  });

  it('requires the current password before changing protected account fields', async () => {
    const record = await activeUser();
    findUnique.mockResolvedValueOnce(record);

    await expect(
      service().updateOwnAccount(
        {
          id: record.id,
          name: record.name,
          email: record.email,
          notificationEmail: record.notificationEmail,
          roles: record.roleAssignments,
          staffProfileId: record.staffProfile.id,
          studentProfile: null,
        },
        {
          notificationEmail: 'new@example.edu',
          currentPassword: 'wrong-password',
        },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('returns a generic reset challenge for an unknown email', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(
      service().requestPasswordReset('unknown@example.edu'),
    ).resolves.toMatchObject({
      challengeId: expect.any(String),
      expiresInSeconds: 600,
    });
    expect(sendPasswordResetOtp).not.toHaveBeenCalled();
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
