import { UserRole } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { AuthenticationGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

const setHeader = jest.fn();
const context = (request: Record<string, unknown> = { headers: {} }) =>
  ({
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
  }) as never;

describe('AuthenticationGuard', () => {
  it('allows explicitly public routes without a session', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const auth = { userForSession: jest.fn() };
    const guard = new AuthenticationGuard(reflector as never, auth as never);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(auth.userForSession).not.toHaveBeenCalled();
  });

  it('rejects protected routes with no session cookie', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new AuthenticationGuard(reflector as never, {} as never);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the authenticated user to the request', async () => {
    const request = { headers: { cookie: 'mirai_session=valid-token' } };
    const user = { id: 'user-a', roles: [] };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const auth = {
      userForSession: jest.fn().mockResolvedValue(user),
      sessionCookieMaxAgeSeconds: 34560000,
    };
    const guard = new AuthenticationGuard(reflector as never, auth as never);

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toMatchObject({ user, sessionToken: 'valid-token' });
    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=34560000'),
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('HttpOnly'),
    );
  });
});

describe('RolesGuard', () => {
  it('allows a user with one of the required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.CAMPUS_MANAGER]),
    };
    const request = {
      headers: {},
      user: {
        roles: [{ role: UserRole.CAMPUS_MANAGER, campusId: 'campus-a' }],
      },
    };
    const guard = new RolesGuard(reflector as never);
    expect(guard.canActivate(context(request))).toBe(true);
  });

  it('blocks a user without the required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.PROGRAM_MANAGER]),
    };
    const request = {
      headers: {},
      user: { roles: [{ role: UserRole.STUDENT, campusId: 'campus-a' }] },
    };
    const guard = new RolesGuard(reflector as never);
    expect(guard.canActivate(context(request))).toBe(false);
  });
});
