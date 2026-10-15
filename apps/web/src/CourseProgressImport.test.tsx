import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { CourseProgressImport } from './CourseProgressImport';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('requires a reviewed preview and invalidates it when the mapping changes', async () => {
  const mapping = {
    sheet: 'Progress',
    header: 1,
    topic: 0,
    hours: 1,
    completion: -1,
    status: -1,
    plannedDate: -1,
    taughtDate: -1,
    percentScale: 'percent',
  };
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith('/lesson-plans/offerings?campusId=campus-a')
        ? [
            {
              id: 'subject',
              subject: { name: 'Web' },
              batch: {
                name: 'A',
                semester: { name: 'Term', campus: { name: 'Campus' } },
              },
              plan: null,
            },
          ]
        : url.endsWith('/inspect')
          ? {
              sheets: [
                { name: 'Progress', rows: [['Topic', 'Hours']], totalRows: 2 },
              ],
              mapping,
            }
          : url.endsWith('/preview')
            ? {
                valid: true,
                issues: [],
                topics: [
                  {
                    title: 'HTML',
                    minutes: 90,
                    completion: 100,
                    description: 'Source',
                  },
                ],
                preserved: [],
                counts: {
                  topics: 1,
                  completed: 1,
                  minutes: 90,
                  nonTeachingRows: 0,
                },
              }
            : {};
      return new Response(JSON.stringify(data), { status: 200 });
    });
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CourseProgressImport campusId="campus-a" />
    </QueryClientProvider>,
  );
  await screen.findByText('Web · A · Term · Campus');
  fireEvent.change(screen.getByLabelText('1. Choose the subject and batch'), {
    target: { value: 'subject' },
  });
  fireEvent.change(screen.getByLabelText('2. Choose your progress file'), {
    target: {
      files: [
        new File(['Topic,Hours\nHTML,1.5'], 'progress.csv', {
          type: 'text/csv',
        }),
      ],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
  await screen.findByText('3. Check the columns');
  expect(
    screen.queryByRole('button', { name: 'Confirm progress import' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Preview progress' }));
  expect(
    await screen.findByRole('button', { name: 'Confirm progress import' }),
  ).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Completion values'), {
    target: { value: 'fraction' },
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Confirm progress import' }),
    ).not.toBeInTheDocument(),
  );
  expect(
    fetch.mock.calls.some(([url]) => String(url).endsWith('/imports/progress')),
  ).toBe(false);
});
