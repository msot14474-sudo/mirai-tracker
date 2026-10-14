import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StudentLectureFeedback } from './StudentLectureFeedback';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const lecture = {
  id: 'lecture-a',
  startsAt: '2026-10-13T04:00:00Z',
  endsAt: '2026-10-13T05:00:00Z',
  subject: { code: 'DSA', name: 'Data Structures' },
  teacher: 'Vishal Rathee',
  coveredSummary: 'Arrays and loops',
  review: null,
};
function setup(review: object | null = null) {
  const writes: unknown[] = [];
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) => {
      if (init?.method === 'PUT') {
        writes.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ understood: true }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          lectures: [{ ...lecture, review }],
          pendingCount: 1,
          total: 1,
          page: 0,
          pageSize: 20,
          timezone: 'Asia/Kolkata',
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <StudentLectureFeedback />
    </QueryClientProvider>,
  );
  return { writes, fetcher };
}
it('asks for understanding and requires details when the student needs help', async () => {
  const { writes } = setup();
  expect(await screen.findByText('Vishal Rathee')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Submit feedback' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByLabelText('No, I need help'));
  const details = screen.getByRole('textbox', {
    name: /What did you not understand/,
  });
  expect(details).toBeRequired();
  fireEvent.change(details, { target: { value: '  ' } });
  expect(
    screen.getByRole('button', { name: 'Submit feedback' }),
  ).toBeDisabled();
  fireEvent.change(details, { target: { value: 'Array indexing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }));
  await waitFor(() =>
    expect(writes).toEqual([
      { understood: false, unclearTopics: 'Array indexing' },
    ]),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('saved');
});
it('submits yes without requiring an explanation', async () => {
  const { writes } = setup();
  fireEvent.click(await screen.findByLabelText('Yes, I understood'));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }));
  await waitFor(() => expect(writes).toEqual([{ understood: true }]));
});
it('lets students update their previously submitted feedback', async () => {
  const { writes } = setup({
    understood: false,
    unclearTopics: 'Recursion',
    updatedAt: '2026-10-13T06:00:00Z',
  });
  expect(await screen.findByRole('textbox')).toHaveValue('Recursion');
  fireEvent.click(screen.getByLabelText('Yes, I understood'));
  fireEvent.click(screen.getByRole('button', { name: 'Update feedback' }));
  await waitFor(() => expect(writes).toEqual([{ understood: true }]));
});
