import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceSessionGeneration,
  resolveApiUrl,
  canRecoverRequest,
  RequestError,
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
  it('allows a full semester download to finish beyond the normal read deadline', async () => {
    vi.useFakeTimers();
    const bytes = new Uint8Array([80, 75, 3, 4]);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(new Response(bytes)), 20_000);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const pending = apiFetch(
      '/api/campus-data/semesters/demo/export',
      {},
      { download: true },
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(new Uint8Array(await (await pending).arrayBuffer())).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
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

it('handles a connection drop while consuming the body of a read', async () => {
  const broken = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new TypeError('Failed to fetch'));
      },
    }),
  );
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(broken)
    .mockResolvedValueOnce(json({ restored: true }));
  expect(await (await apiFetch('/api/subjects')).json()).toEqual({
    restored: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('protects downloads when the connection drops after headers', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('Failed to fetch'));
        },
      }),
    ),
  );
  await expect(apiFetch('/api/exports', { method: 'POST' })).rejects.toThrow(
    'Check whether your change was saved',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('preserves binary downloads and their filenames', async () => {
  const bytes = new Uint8Array([0, 255, 42, 128]);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(bytes, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="report.xlsx"',
      },
    }),
  );
  const response = await apiFetch('/api/exports', { method: 'POST' });
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get('Content-Disposition')).toContain('report.xlsx');
});
it('preserves an explicitly requested HTML report attachment', async () => {
  const content = '<!doctype html><h1>Academic analysis</h1>';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(content, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="report.html"',
      },
    }),
  );
  const response = await apiFetch(
    '/api/reports/document',
    { method: 'POST' },
    { htmlAttachment: true },
  );
  expect(await response.text()).toBe(content);
  expect(response.headers.get('Content-Disposition')).toContain('report.html');
});
it.each([
  { requested: true, attachment: false },
  { requested: false, attachment: true },
])(
  'rejects unexpected HTML even on report routes (%o)',
  async ({ requested, attachment }) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Proxy fallback</html>', {
        headers: {
          'Content-Type': 'text/html',
          ...(attachment
            ? { 'Content-Disposition': 'attachment; filename="report.html"' }
            : {}),
        },
      }),
    );
    await expect(
      apiFetch(
        '/api/reports/document',
        { method: 'POST' },
        { htmlAttachment: requested },
      ),
    ).rejects.toThrow('unexpected response');
  },
);
it('does not send a queued retry after the session changes', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new TypeError('Failed to fetch'));
  const result = expect(apiFetch('/api/subjects')).rejects.toMatchObject({
    name: 'AbortError',
  });
  await vi.advanceTimersByTimeAsync(100);
  advanceSessionGeneration();
  await vi.advanceTimersByTimeAsync(500);
  await result;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps production requests on the cookie-bearing website origin', () => {
  expect(resolveApiUrl(true, 'https://old-api.example.com')).toBe('/api');
  expect(resolveApiUrl(false, 'http://localhost:3001/')).toBe(
    'http://localhost:3001',
  );
  expect(canRecoverRequest(new RequestError('offline'))).toBe(true);
  expect(canRecoverRequest(new RequestError('forbidden', 403))).toBe(false);
});

it('shows an actionable AI provider error without retrying the request', async () => {
  const message =
    'The AI provider rejected its credentials. Ask your administrator to check the AI API key.';
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(json({ message }, 503));
  await expect(
    apiFetch('/api/ai-insights/report', { method: 'POST' }),
  ).rejects.toThrow(message);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
