import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceSessionGeneration,
  apiFetch,
  sessionExpiredEvent,
} from './http';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('shared request protection', () => {
  it('recovers a transient read failure and sends the session cookie', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({ ok: true }));
    expect(await (await apiFetch('/api/subjects')).json()).toEqual({
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/subjects',
      expect.objectContaining({
        credentials: 'include',
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it('never replays a write after an ambiguous failure', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      apiFetch('/api/subjects', { method: 'POST', body: '{}' }),
    ).rejects.toThrow('Check whether your change was saved');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('requires sign in after a protected 401 without retrying', async () => {
    const expired = vi.fn();
    window.addEventListener(sessionExpiredEvent, expired);
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ message: 'Authentication required.' }, 401));
    await expect(apiFetch('/api/topic-schedules/offerings')).rejects.toThrow(
      'Please sign in again',
    );
    expect(expired).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    window.removeEventListener(sessionExpiredEvent, expired);
  });
  it('does not expire the session for a wrong current password or login code', async () => {
    const expired = vi.fn();
    window.addEventListener(sessionExpiredEvent, expired);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      json(
        {
          message: String(url).endsWith('account')
            ? 'The current password is incorrect.'
            : 'Invalid code.',
        },
        401,
      ),
    );
    await expect(
      apiFetch('/api/auth/account', { method: 'PATCH' }),
    ).rejects.toThrow('current password');
    await expect(
      apiFetch('/api/auth/verify-otp', { method: 'POST' }),
    ).rejects.toThrow('Invalid code');
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener(sessionExpiredEvent, expired);
  });
  it('returns a signed-out session check normally', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    expect((await apiFetch('/api/auth/me')).status).toBe(401);
  });
  it('stops retrying outages after two reads', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => json({}, 503));
    await expect(apiFetch('/api/subjects')).rejects.toThrow(
      'temporarily unavailable',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps validation and access errors without retrying', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => json({ message: 'Access denied.' }, 403));
    await expect(apiFetch('/api/subjects')).rejects.toMatchObject({
      status: 403,
      message: 'Access denied.',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds a hanging request and does not retry a timed-out write', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      );
    const result = expect(
      apiFetch('/api/subjects', { method: 'POST' }),
    ).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(60_000);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('discards a late unauthorized response from a previous session', async () => {
    let finish!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const expired = vi.fn();
    window.addEventListener(sessionExpiredEvent, expired);
    const result = expect(apiFetch('/api/subjects')).rejects.toMatchObject({
      name: 'AbortError',
    });
    advanceSessionGeneration();
    finish(json({}, 401));
    await result;
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener(sessionExpiredEvent, expired);
  });
  it('handles malformed service JSON without leaking a parser error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response('{', { headers: { 'content-type': 'application/json' } }),
    );
    await expect(apiFetch('/api/subjects')).rejects.toThrow(
      'unreadable response',
    );
  });
});
