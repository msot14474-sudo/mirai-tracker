import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationCenter } from './NotificationCenter';
import { WeeklySummaries } from './WeeklySummaries';
import * as api from './notifications';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const wrap = (node: React.ReactNode) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);
it('shows actor, destination and unread state, and marks only visible notifications read', async () => {
  const item = {
    id: 'notice',
    title: 'Timetable updated',
    description: 'Asha: Timetable updated — Networks.',
    actorName: 'Asha',
    category: 'Timetable',
    view: 'timetable',
    campusId: 'campus',
    createdAt: '2026-10-20T04:00:00Z',
    read: false,
  };
  const request = vi
    .spyOn(api, 'notificationRequest')
    .mockResolvedValue({ items: [item], nextBefore: null });
  const open = vi.fn();
  render(
    wrap(
      <NotificationCenter campusId="campus" canViewMissedLogs onOpen={open} />,
    ),
  );
  await screen.findByText(item.description);
  fireEvent.click(screen.getByText('View details'));
  expect(open).toHaveBeenCalledWith('timetable', 'campus');
  await waitFor(() =>
    expect(
      request.mock.calls.some(
        ([path, init]) =>
          path === '/read' &&
          init?.body === JSON.stringify({ ids: ['notice'] }),
      ),
    ).toBe(true),
  );
});
it('opens weekly summaries in AI without a report-download button and labels delivery failure', async () => {
  vi.spyOn(api, 'notificationRequest').mockResolvedValue({
    summaries: [
      {
        id: 'weekly',
        title: 'My subject weekly review',
        text: '**Next focus:** TCP',
        mode: 'ai',
        emailStatus: 'FAILED',
      },
    ],
    schedule: 'Monday',
  });
  render(wrap(<WeeklySummaries compact />));
  fireEvent.click(screen.getByText('Weekly summaries'));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await screen.findByText('My subject weekly review');
  expect(
    screen.getByText(/Email delivery needs attention/),
  ).toBeInTheDocument();
  expect(screen.queryByText('Download report')).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('');
  expect(screen.getByRole('button', { name: 'Weekly summaries' })).toHaveFocus();
});
