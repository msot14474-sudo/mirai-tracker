import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RequestOriginGuard } from './origin.guard';

function context(method: string, origin?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers: { origin } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RequestOriginGuard', () => {
  beforeEach(() => {
    process.env.WEB_ORIGIN = 'http://localhost:5173';
  });

  it('allows safe reads from any origin', () => {
    expect(
      new RequestOriginGuard().canActivate(
        context('GET', 'https://untrusted.example'),
      ),
    ).toBe(true);
  });

  it('allows same-origin browser mutations', () => {
    expect(
      new RequestOriginGuard().canActivate(
        context('POST', 'http://localhost:5173'),
      ),
    ).toBe(true);
  });

  it('rejects cross-origin browser mutations', () => {
    expect(() =>
      new RequestOriginGuard().canActivate(
        context('DELETE', 'https://untrusted.example'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows service calls that do not send an Origin header', () => {
    expect(new RequestOriginGuard().canActivate(context('POST'))).toBe(true);
  });
});
