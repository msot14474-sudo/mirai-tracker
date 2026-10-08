import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { RequestTimingInterceptor } from './request-timing.interceptor';

describe('RequestTimingInterceptor', () => {
  it('adds browser and Server-Timing headers to successful responses', async () => {
    const setHeader = jest.fn();
    const context = httpContext(setHeader);
    const next = { handle: () => of({ ok: true }) } as CallHandler;

    await firstValueFrom(
      new RequestTimingInterceptor().intercept(context, next),
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringMatching(/^app;dur=\d+\.\d{2}$/),
    );
    expect(setHeader).toHaveBeenCalledWith(
      'X-Response-Time',
      expect.stringMatching(/^\d+\.\d{2}ms$/),
    );
  });

  it('records timing when the request fails', async () => {
    const setHeader = jest.fn();
    const context = httpContext(setHeader);
    const next = {
      handle: () => throwError(() => new Error('failed')),
    } as CallHandler;

    await expect(
      firstValueFrom(new RequestTimingInterceptor().intercept(context, next)),
    ).rejects.toThrow('failed');
    expect(setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringMatching(/^app;dur=/),
    );
  });
});

function httpContext(setHeader: jest.Mock) {
  return {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
}
