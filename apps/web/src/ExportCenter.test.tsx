import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportCenter } from './ExportCenter';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCenter() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExportCenter />
    </QueryClientProvider>,
  );
}

describe('ExportCenter', () => {
  it('downloads a dated campus progress CSV and refreshes the audit history', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) => {
        if (init?.method === 'POST') {
          return new Response('campus_code,status\r\nHI-TECH,ON_TRACK\r\n', {
            status: 200,
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition':
                'attachment; filename="campus-progress.csv"',
            },
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
    const createObjectURL = vi.fn(() => 'blob:mirai');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );

    renderCenter();
    expect(await screen.findByText('No exports yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Progress position date'), {
      target: { value: '2026-10-08' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Download CSV' })[0]!);

    expect(await screen.findByText('campus-progress.csv')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(
      (call) => call[1]?.method === 'POST',
    );
    expect(post?.[1]?.body).toBe(
      JSON.stringify({ type: 'CAMPUS_PROGRESS', asOf: '2026-10-08' }),
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mirai');
  });

  it('sends the selected month and per-lecture rate for honorarium', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) =>
        init?.method === 'POST'
          ? new Response('month,taken_lectures\r\n2026-09,4\r\n', {
              status: 200,
              headers: {
                'Content-Disposition': 'attachment; filename="honorarium.csv"',
              },
            })
          : new Response(JSON.stringify([]), { status: 200 }),
      );
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mirai'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );

    renderCenter();
    await screen.findByText('No exports yet');
    fireEvent.change(screen.getByLabelText('Honorarium month'), {
      target: { value: '2026-09' },
    });
    fireEvent.change(screen.getByLabelText('Rate per taken lecture (₹)'), {
      target: { value: '1800' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Download CSV' })[2]!);

    await screen.findByText('honorarium.csv');
    const post = fetchMock.mock.calls.find(
      (call) => call[1]?.method === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      type: 'VISITING_FACULTY_HONORARIUM',
      month: '2026-09',
      ratePerLecture: 1800,
    });
  });
});
