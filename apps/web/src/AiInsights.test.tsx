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
    if (String(_url).includes('/conversations'))
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' },
      });
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
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  fireEvent.click(screen.getByText('Academic context and priorities'));
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
  fireEvent.change(screen.getByLabelText('Message Mirai AI'), {
    target: { value: 'What next?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
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
it('reopens saved conversations and sends follow-ups using their conversation id', async () => {
  const writes: unknown[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    let data: unknown = {
      ...snapshot,
      ai: { ready: true, provider: 'ollama' },
    };
    if (String(url).includes('/conversations?'))
      data = [{ id: 'chat-1', title: 'Focus areas' }];
    if (String(url).includes('/conversations/chat-1'))
      data = {
        id: 'chat-1',
        title: 'Focus areas',
        earlierMessages: 0,
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'Which topics need work?',
            createdAt: snapshot.generatedAt,
          },
          {
            id: 'm2',
            role: 'assistant',
            content: 'Focus on Arrays.',
            createdAt: snapshot.generatedAt,
          },
        ],
      };
    if (init?.method === 'POST') {
      writes.push(JSON.parse(String(init.body)));
      data = {
        mode: 'ai',
        conversationId: 'chat-1',
        text: 'Start with an array exercise.',
        generatedAt: snapshot.generatedAt,
        snapshot,
      };
    }
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AiInsights canLog={false} onOpen={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.queryByLabelText('Saved chats')).not.toBeInTheDocument();
  await screen.findByText('Focus on Arrays.');
  fireEvent.change(screen.getByLabelText('Message Mirai AI'), {
    target: { value: 'How should I teach that?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        useAi: true,
        conversationId: 'chat-1',
        question: 'How should I teach that?',
      },
    ]),
  );
});

it('sends with Enter and preserves Shift+Enter for multiline follow-ups', async () => {
  const { requests } = setup(true);
  await waitFor(() =>
    expect(screen.getByLabelText('Message Mirai AI')).toBeEnabled(),
  );
  const composer = screen.getByLabelText('Message Mirai AI');
  fireEvent.change(composer, { target: { value: 'What next?' } });
  fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
  expect(requests).toHaveLength(0);
  fireEvent.keyDown(composer, { key: 'Enter' });
  await waitFor(() => expect(requests).toHaveLength(1));
});
