import { UserRole, UserStatus } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

describe('AuthService', () => {
  const findUnique = jest.fn();
  const createAuditEvent = jest.fn();
  const prisma = {
    user: { findUnique },
    auditEvent: { create: createAuditEvent },
  };
  const redis = {
    get: jest.fn(),
    setWithExpiry: jest.fn(),
    delete: jest.fn(),
    incrementWithExpiry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSION_SECRET = 'test-session-secret';
    redis.get.mockResolvedValue(null);
    redis.incrementWithExpiry.mockResolvedValue(1);
    createAuditEvent.mockResolvedValue({ id: 'audit-login' });
  });

  async function activeUser(status: UserStatus = UserStatus.ACTIVE) {
    const credential = await hashPassword('correct-password');
    return {
      id: 'user-a',
      name: 'Faculty A',
      email: 'faculty@mirai.local',
      status,
      passwordCredential: credential,
      roleAssignments: [{ role: UserRole.FACULTY, campusId: 'campus-a' }],
      staffProfile: { id: 'faculty-a' },
      studentProfile: null,
    };
  }

  it('creates an opaque Redis session for valid credentials', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    const service = new AuthService(prisma as never, redis as never);

    const result = await service.login(
      '  FACULTY@MIRAI.LOCAL ',
      'correct-password',
    );

    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.user.roles[0]?.role).toBe(UserRole.FACULTY);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'faculty@mirai.local' } }),
    );
    expect(redis.setWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
      'user-a',
      28_800,
    );
    expect(createAuditEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'user-a',
        action: 'LOGIN',
        entityType: 'UserSession',
      }),
    });
  });

  it('returns the same generic error for a wrong password', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    const service = new AuthService(prisma as never, redis as never);

    await expect(
      service.login('faculty@mirai.local', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.setWithExpiry).not.toHaveBeenCalled();
    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:login-failures:/),
      900,
    );
  });

  it('temporarily blocks the fifth failed login attempt', async () => {
    findUnique.mockResolvedValue(null);
    redis.incrementWithExpiry.mockResolvedValue(5);
    const service = new AuthService(prisma as never, redis as never);

    await expect(
      service.login('unknown@mirai.local', 'wrong-password'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('removes a newly created session if its audit write fails', async () => {
    findUnique.mockResolvedValueOnce(await activeUser());
    createAuditEvent.mockRejectedValueOnce(new Error('database unavailable'));
    const service = new AuthService(prisma as never, redis as never);

    await expect(
      service.login('faculty@mirai.local', 'correct-password'),
    ).rejects.toThrow('database unavailable');
    expect(redis.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
    );
  });

  it('rejects suspended users even when the password is correct', async () => {
    findUnique.mockResolvedValueOnce(await activeUser(UserStatus.SUSPENDED));
    const service = new AuthService(prisma as never, redis as never);

    await expect(
      service.login('faculty@mirai.local', 'correct-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reloads current roles for every valid session', async () => {
    redis.get.mockReset().mockResolvedValueOnce('user-a');
    const record = await activeUser();
    const { passwordCredential: _credential, ...sessionUser } = record;
    findUnique.mockResolvedValueOnce(sessionUser);
    const service = new AuthService(prisma as never, redis as never);

    await expect(
      service.userForSession('session-token'),
    ).resolves.toMatchObject({
      id: 'user-a',
      staffProfileId: 'faculty-a',
    });
  });

  it('deletes the server-side session on logout', async () => {
    const service = new AuthService(prisma as never, redis as never);
    await service.logout('session-token');
    expect(redis.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
    );
  });
});
