import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  groupUnallocatedByUnit,
  TopicScheduleWorkspace,
} from './TopicScheduleWorkspace';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const offerings = [
  {
    id: 'offering-a',
    subject: { id: 'subject-a', code: 'CS-DSA', name: 'Data Structures' },
    batch: {
      id: 'batch-a',
      code: 'A',
      name: 'Batch A',
      semester: {
        id: 'semester-a',
        name: 'Semester 2026',
        campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
      },
    },
    plan: {
      id: 'plan-a',
      version: 1,
      status: 'ACTIVE',
      topics: 2,
      totalPlannedMinutes: 150,
    },
    sessions: 2,
    latestSchedule: null,
  },
];

const detail = {
  id: 'offering-a',
  subject: offerings[0]!.subject,
  batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
  semester: {
    id: 'semester-a',
    name: 'Semester 2026',
    startDate: '2026-07-01',
    endDate: '2026-12-15',
    campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
  },
  targetFinishDate: '2026-07-31',
  plan: offerings[0]!.plan,
  sessions: [
    {
      id: 'session-one',
      sessionDate: '2026-07-01',
      startsAt: '2026-07-01T03:30:00.000Z',
      endsAt: '2026-07-01T04:30:00.000Z',
      plannedMinutes: 60,
      status: 'SCHEDULED',
      cancellationReason: null,
      hasLogs: false,
      isExtraSession: false,
    },
    {
      id: 'session-two',
      sessionDate: '2026-07-03',
      startsAt: '2026-07-03T03:30:00.000Z',
      endsAt: '2026-07-03T04:30:00.000Z',
      plannedMinutes: 60,
      status: 'SCHEDULED',
      cancellationReason: null,
      hasLogs: false,
      isExtraSession: false,
    },
  ],
  preview: {
    allocations: [
      {
        id: 'topic-a',
        unitSequence: 1,
        topicSequence: 1,
        unitTitle: 'Foundations',
        title: 'Arrays',
        requiredMinutes: 90,
        plannedStartDate: '2026-07-01',
        plannedFinishDate: '2026-07-03',
        allocatedMinutes: 90,
        sessionIds: ['session-one', 'session-two'],
        afterTarget: false,
      },
    ],
    unscheduledTopics: [
      {
        id: 'topic-b',
        unitSequence: 1,
        topicSequence: 2,
        unitTitle: 'Foundations',
        title: 'Linked Lists',
        requiredMinutes: 60,
        allocatedMinutes: 30,
        remainingMinutes: 30,
      },
    ],
    summary: {
      requiredMinutes: 150,
      availableMinutes: 120,
      allocatedMinutes: 120,
      shortfallMinutes: 30,
      usableSessions: 2,
      excludedSessions: 0,
    },
  },
  latestVersion: null,
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWorkspace(canManageSessions = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TopicScheduleWorkspace canManageSessions={canManageSessions} />
    </QueryClientProvider>,
  );
}

function installFetchMock(
  onRequest?: (url: string, init?: RequestInit) => void,
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    onRequest?.(url, init);
    if (url.endsWith('/topic-schedules/offerings')) return json(offerings);
    if (url.endsWith('/topic-schedules/offerings/offering-a'))
      return json(detail);
    if (url.endsWith('/calculate')) {
      return json({ version: { version: 1 }, preview: detail.preview });
    }
    if (url.endsWith('/topic-schedules/sessions/session-one')) {
      return json({ version: { version: 1 }, preview: detail.preview });
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
  });
}

describe('TopicScheduleWorkspace', () => {
  it('summarises repeated topic shortages by unit', () => {
    expect(
      groupUnallocatedByUnit([
        {
          id: 'topic-one',
          unitSequence: 4,
          topicSequence: 1,
          unitTitle: 'APIs and deployment',
          title: 'Foundations',
          requiredMinutes: 120,
          allocatedMinutes: 60,
          remainingMinutes: 60,
        },
        {
          id: 'topic-two',
          unitSequence: 4,
          topicSequence: 2,
          unitTitle: 'APIs and deployment',
          title: 'Guided practice',
          requiredMinutes: 120,
          allocatedMinutes: 0,
          remainingMinutes: 120,
        },
      ]),
    ).toEqual([
      {
        unitSequence: 4,
        unitTitle: 'APIs and deployment',
        remainingMinutes: 180,
        topics: 2,
      },
    ]);
  });

  it('does not show an empty offering result when loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: 'Access denied.' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    );
    renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access denied.',
    );
    expect(screen.queryByText('No subject offerings')).not.toBeInTheDocument();
  });

  it('shows live allocations, capacity and the explicit shortfall', async () => {
    installFetchMock();
    renderWorkspace();

    expect(await screen.findByText('Arrays')).toBeInTheDocument();
    expect(screen.getAllByText('01 Jul 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('03 Jul 2026').length).toBeGreaterThan(0);
    expect(screen.getByText('Linked Lists')).toBeInTheDocument();
    expect(screen.getByText('30 min still needed')).toBeInTheDocument();
    expect(screen.getByText('Partly scheduled')).toBeInTheDocument();
    expect(screen.getByText('2 usable classes')).toBeInTheDocument();
  });

  it('saves the live calculation as a version', async () => {
    const writes: Array<{ url: string; method: string | undefined }> = [];
    installFetchMock((url, init) => {
      if (init?.method) writes.push({ url, method: init.method });
    });
    renderWorkspace();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Save calculated dates' }),
    );
    await waitFor(() =>
      expect(writes).toContainEqual({
        url: expect.stringContaining('/offerings/offering-a/calculate'),
        method: 'POST',
      }),
    );
  });

  it('requires and sends a reason when cancelling a class', async () => {
    const writes: Array<{ url: string; body: unknown }> = [];
    installFetchMock((url, init) => {
      if (init?.method === 'PATCH') {
        writes.push({ url, body: JSON.parse(String(init.body)) });
      }
    });
    renderWorkspace();

    const reason = await screen.findByLabelText(
      'Cancellation reason for 2026-07-01',
    );
    fireEvent.change(reason, { target: { value: 'Faculty unavailable' } });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Cancel class' })[0]!,
    );

    await waitFor(() =>
      expect(writes).toContainEqual({
        url: expect.stringContaining('/topic-schedules/sessions/session-one'),
        body: { cancelled: true, reason: 'Faculty unavailable' },
      }),
    );
  });
});

it('lets faculty view classes without timetable editing controls', async () => {
  installFetchMock();
  renderWorkspace(false);
  expect(await screen.findByText('Arrays')).toBeInTheDocument();
  expect(
    screen.getByText(/ask your campus manager to change class times/i),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Move class' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Cancel class' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Restore' }),
  ).not.toBeInTheDocument();
});
