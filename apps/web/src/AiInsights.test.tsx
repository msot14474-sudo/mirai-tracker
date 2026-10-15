import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AiInsights, reportHtml } from './AiInsights';
const snapshot = {
  generatedAt: '2026-10-15T10:00:00Z',
  scope: 'Selected campus',
  ai: { ready: false, provider: null },
  coverage: {
    note: 'Current plans, recent lectures.',
    pastLectures: 1,
    recentLecturesIncluded: 1,
    upcomingLectures: 0,
    upcomingIncluded: 0,
    feedbackGaps: 0,
    feedbackGapsIncluded: 0,
  },
  summary: {
    subjects: 1,
    attention: 1,
    overdueTopics: 1,
    missingLogs: 0,
    needsHelp: 0,
    reviews: 0,
  },
  subjects: [
    {
      id: 's1',
      code: 'DSA',
      name: 'Data Structures',
      batch: 'A',
      campus: { name: 'Hi-Tech' },
      completion: 25,
      plan: { version: 1, status: 'ACTIVE' },
      teachers: ['Faculty A'],
      overdueTopics: 1,
      missingLogs: 0,
      nextTopics: ['Arrays'],
      issues: ['Replan 1 overdue topic.'],
      exams: [],
    },
  ],
  upcomingLectures: [],
  recentGaps: [],
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(ready = false, fail = false) {
  const requests: unknown[] = [];
  const onOpen = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      requests.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify(
          fail
            ? { message: 'AI temporarily unavailable' }
            : {
                mode: 'data',
                text: 'Academic report: Arrays',
                generatedAt: snapshot.generatedAt,
                snapshot,
              },
        ),
        {
          status: fail ? 503 : 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return new Response(
      JSON.stringify({
        ...snapshot,
        ai: { ready, provider: ready ? 'openai' : null },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
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
      <AiInsights campusId="campus-a" canLog={false} onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { requests, onOpen };
}
it('shows grounded priorities and keeps data reports available without AI', async () => {
  const { requests, onOpen } = setup();
  await screen.findByText('Data Structures');
  expect(screen.getByRole('button', { name: 'Ask AI' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review lesson plans' }));
  expect(onOpen).toHaveBeenCalledWith('lesson-plans');
  fireEvent.click(screen.getByRole('button', { name: 'Generate report' }));
  await screen.findByText('Academic report: Arrays');
  expect(requests).toEqual([{ campusId: 'campus-a', useAi: false }]);
  expect(screen.getByRole('button', { name: 'Download report' })).toBeEnabled();
});
it('submits AI questions with selected scope but never client context', async () => {
  const { requests } = setup(true);
  await screen.findByText('Data Structures');
  fireEvent.change(
    screen.getByLabelText('What would you like to understand?'),
    { target: { value: 'What next?' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  await waitFor(() =>
    expect(requests).toEqual([
      { campusId: 'campus-a', useAi: true, question: 'What next?' },
    ]),
  );
});
it('keeps dashboard usable when report generation fails', async () => {
  setup(true, true);
  await screen.findByText('Data Structures');
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI report' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Generate report' })).toBeEnabled();
  expect(screen.getByText('Data Structures')).toBeInTheDocument();
});
it('escapes model and student text in downloadable reports', () => {
  const html = reportHtml({
    mode: 'ai',
    text: '<script>alert(1)</script>',
    generatedAt: snapshot.generatedAt,
    snapshot,
  });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
