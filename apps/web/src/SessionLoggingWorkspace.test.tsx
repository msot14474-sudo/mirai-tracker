import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionLoggingWorkspace } from './SessionLoggingWorkspace';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const session = {
  id: 'session-a',
  sessionDate: '2026-10-08',
  startsAt: '2026-10-08T03:30:00.000Z',
  endsAt: '2026-10-08T04:30:00.000Z',
  plannedMinutes: 60,
  status: 'SCHEDULED',
  isExtraSession: false,
  subject: { id: 'subject-a', code: 'CS-DSA', name: 'Data Structures' },
  batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
  campus: {
    id: 'campus-a',
    code: 'MAIN',
    name: 'Main Campus',
    timezone: 'Asia/Kolkata',
  },
  plan: { id: 'plan-a', version: 1, status: 'ACTIVE' },
  topics: [
    {
      id: 'topic-a',
      unitSequence: 1,
      unitTitle: 'Foundations',
      sequence: 1,
      title: 'Arrays',
      plannedMinutes: 120,
      status: 'NOT_STARTED',
      currentCompletionPercentage: 0,
      plannedStartDate: '2026-10-08',
      plannedFinishDate: '2026-10-15',
    },
  ],
  latestLog: null,
  prefill: {
    status: 'COMPLETED',
    overallCompletionPercentage: 100,
    coveredSummary: 'Arrays',
    leftOverSummary: 'Continue Arrays',
    carryForwardTopicId: 'topic-a',
    classworkStatus: 'NOT_ASSIGNED',
    homeworkStatus: 'NOT_ASSIGNED',
    notes: null,
    mergedIntoSessionId: null,
    cancellationReason: null,
    topicUpdates: [
      {
        topicId: 'topic-a',
        completionAfterPercentage: 50,
        minutesUsed: 60,
        notes: null,
      },
    ],
  },
};

const day = {
  date: '2026-10-08',
  sessions: [session],
  mergeTargets: [],
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWorkspace(client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })) {
  return render(
    <QueryClientProvider client={client}>
      <SessionLoggingWorkspace />
    </QueryClientProvider>,
  );
}

function installFetchMock(
  onRequest?: (url: string, init?: RequestInit) => void,
  responseDay: unknown = day,
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    onRequest?.(url, init);
    if (url.includes('/session-logs/sessions?date=')) return json(responseDay);
    if (url.endsWith('/session-logs/sessions/session-a/logs')) {
      return json({ id: 'log-a', revision: 1, status: 'COMPLETED' });
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
  });
}

describe('SessionLoggingWorkspace', () => {
  it('shows the timetable and current-topic prefill', async () => {
    installFetchMock();
    renderWorkspace();

    expect(await screen.findByText('Data Structures')).toBeInTheDocument();
    expect(screen.getByText('09:00 am')).toBeInTheDocument();
    expect(screen.getByLabelText('Arrays completion after class')).toHaveValue(
      50,
    );
    expect(screen.getByLabelText('Arrays minutes used')).toHaveValue(60);
    expect(screen.getByDisplayValue('Continue Arrays')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm session in one tap' }),
    ).toBeInTheDocument();
  });

  it('submits the complete pre-filled session with one confirmation tap', async () => {
    const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
    installFetchMock((url, init) => {
      if (init?.method === 'POST') {
        writes.push({ url, body: JSON.parse(String(init.body)) });
      }
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const overviewKey = ['ai-insights', 'campus-a', ''];
    client.setQueryData(overviewKey, { coverage: { loggedLectures: 0 } });
    renderWorkspace(client);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm session in one tap' }),
    );

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      url: expect.stringContaining('/session-logs/sessions/session-a/logs'),
      body: {
        status: 'COMPLETED',
        overallCompletionPercentage: 100,
        coveredSummary: 'Arrays',
        carryForwardTopicId: 'topic-a',
        topicUpdates: [
          {
            topicId: 'topic-a',
            completionAfterPercentage: 50,
            minutesUsed: 60,
            notes: null,
          },
        ],
        clientElapsedSeconds: expect.any(Number),
      },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved revision',
    );
    await waitFor(() => expect(client.getQueryState(overviewKey)?.isInvalidated).toBe(true));
  });

  it('captures a cancellation reason without advancing a topic', async () => {
    const writes: Array<Record<string, unknown>> = [];
    installFetchMock((_url, init) => {
      if (init?.method === 'POST') writes.push(JSON.parse(String(init.body)));
    });
    renderWorkspace();

    fireEvent.change(
      await screen.findByLabelText('Data Structures session status'),
      { target: { value: 'CANCELLED' } },
    );
    fireEvent.change(
      screen.getByLabelText('Data Structures cancellation reason'),
      {
        target: { value: 'Campus closure' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm session in one tap' }),
    );

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      status: 'CANCELLED',
      overallCompletionPercentage: 0,
      coveredSummary: 'Session cancelled',
      cancellationReason: 'Campus closure',
      topicUpdates: [],
      carryForwardTopicId: null,
    });
  });

  it('presents an existing log as a correction revision', async () => {
    installFetchMock(undefined, {
      ...day,
      sessions: [
        {
          ...session,
          latestLog: {
            id: 'log-a',
            revision: 2,
            status: 'COMPLETED',
            loggedAt: '2026-10-08T05:00:00.000Z',
          },
        },
      ],
    });
    renderWorkspace();

    expect(await screen.findByText('Logged · revision 2')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save corrected log' }),
    ).toBeInTheDocument();
  });
});
