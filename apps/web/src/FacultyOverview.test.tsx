import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { FacultyOverview } from './FacultyOverview';
vi.mock('./ProgressDashboard', () => ({
  ProgressDashboard: () => <div>Own subject progress</div>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FacultyOverview userId="faculty-a" name="Teacher One" onOpen={vi.fn()} />
    </QueryClientProvider>,
  );
}
it('shows an assigned catalog subject before batch setup without requesting AI', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 's', name: 'Web Development', code: 'WD', offerings: [] },
        ]),
        { status: 200 },
      ),
    );
  show();
  expect(await screen.findByText('Web Development')).toBeInTheDocument();
  expect(
    screen.getByText(/still needs to link this subject/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Log a class' }),
  ).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.every(([url]) => !String(url).includes('ai-insights')),
  ).toBe(true);
});
it('refreshes a newly assigned batch without requiring sign out', async () => {
  const subject = {
    id: 's',
    name: 'Web Development',
    code: 'WD',
    offerings: [
      { id: 'o', batch: { name: 'Batch A', semester: { name: 'Semester 1' } } },
    ],
  };
  vi.spyOn(globalThis, 'fetch')
    .mockImplementationOnce(async () => new Response('[]', { status: 200 }))
    .mockImplementation(
      async () => new Response(JSON.stringify([subject]), { status: 200 }),
    );
  show();
  await screen.findByText(/No subjects have been assigned/);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh subjects' }));
  expect(await screen.findByText('Web Development')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Open lesson plans' }),
  ).toBeInTheDocument();
});
