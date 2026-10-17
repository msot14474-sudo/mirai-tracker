// Production uses the deployed /api proxy so session cookies never cross origins.
export function resolveApiUrl(production: boolean, configured?: string) {
  return production
    ? '/api'
    : (configured || 'http://localhost:3000').replace(/\/$/, '');
}
export const apiUrl = resolveApiUrl(
  import.meta.env.PROD,
  import.meta.env.VITE_API_URL,
);
export const sessionExpiredEvent = 'mirai:session-expired';
let sessionGeneration = 0;
export function advanceSessionGeneration() {
  sessionGeneration++;
}

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

const publicAuthPaths = [
  '/auth/login',
  '/auth/verify-otp',
  '/auth/forgot-password',
  '/auth/verify-reset-otp',
  '/auth/reset-password',
  '/auth/logout',
];

/** Retry reads only: a lost write response must never cause a duplicate submission. */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const generation = sessionGeneration;
  const read = ['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase());
  const path = new URL(url, window.location.origin).pathname.replace(
    /^\/api/,
    '',
  );
  for (let attempt = 0; ; attempt++) {
    if (generation !== sessionGeneration || init.signal?.aborted) {
      throw new DOMException('Request cancelled.', 'AbortError');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    const timeout = window.setTimeout(abort, read ? 15_000 : 60_000);
    let error: RequestError;
    try {
      const received = await fetch(url, {
        ...init,
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      // Read the complete body under the same timeout and network-error handling.
      // Returning a buffered response also protects JSON parsing and downloads.
      const bytes = await received.arrayBuffer();
      if (generation !== sessionGeneration || init.signal?.aborted)
        throw new DOMException('Request cancelled.', 'AbortError');
      const response = new Response(
        [204, 205, 304].includes(received.status) ? null : bytes,
        {
          status: received.status,
          statusText: received.statusText,
          headers: received.headers,
        },
      );
      if (response.status === 401 && path === '/auth/logout') return response;
      if (response.status === 401 && path === '/auth/me') {
        window.dispatchEvent(new Event(sessionExpiredEvent));
        return response;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          body?.errors
            ?.map((item: { message: string }) => item.message)
            .join(' ') ||
          (Array.isArray(body?.message)
            ? body.message.join(' ')
            : body?.message);
        const expired =
          response.status === 401 &&
          !publicAuthPaths.includes(path) &&
          (path !== '/auth/account' ||
            message !== 'The current password is incorrect.');
        if (expired) window.dispatchEvent(new Event(sessionExpiredEvent));
        throw new RequestError(
          expired
            ? 'Your session is no longer valid. Please sign in again.'
            : response.status >= 500
              ? path === '/ai-insights/report' && typeof message === 'string'
                ? message
                : 'The service is temporarily unavailable. Please try again.'
              : response.status === 429
                ? 'Too many requests. Please wait a moment and try again.'
                : typeof message === 'string'
                  ? message
                  : 'The request could not be completed.',
          response.status,
        );
      }
      if (response.headers.get('content-type')?.includes('text/html')) {
        throw new RequestError(
          'The service returned an unexpected response. Please try again.',
          502,
        );
      }
      if (
        response.headers.get('content-type')?.includes('application/json') &&
        response.status !== 204
      ) {
        const text = new TextDecoder().decode(bytes);
        try {
          JSON.parse(text);
        } catch {
          throw new RequestError(
            'The service returned an unreadable response. Please try again.',
            502,
          );
        }
      }
      return response;
    } catch (cause) {
      if (init.signal?.aborted || generation !== sessionGeneration) {
        throw new DOMException('Request cancelled.', 'AbortError');
      }
      error =
        cause instanceof RequestError
          ? cause
          : new RequestError(
              navigator.onLine === false
                ? 'You are offline. Check your connection and try again.'
                : controller.signal.aborted
                  ? read
                    ? 'The request timed out. Please try again.'
                    : 'The request timed out. Check whether your change was saved before trying again.'
                  : read
                    ? 'Unable to connect. Please try again.'
                    : 'Connection interrupted. Check whether your change was saved before trying again.',
            );
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener('abort', abort);
    }
    if (
      !read ||
      attempt >= 1 ||
      navigator.onLine === false ||
      (error.status !== 0 && ![502, 503, 504].includes(error.status))
    )
      throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export function canRecoverRequest(error: unknown): boolean {
  return (
    error instanceof RequestError &&
    (error.status === 0 || [502, 503, 504].includes(error.status))
  );
}
