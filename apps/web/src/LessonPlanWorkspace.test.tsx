import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LessonPlanWorkspace } from './LessonPlanWorkspace';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const detail = {
  id: 'offering-a',
  subject: { id: 'subject-a', code: 'CS-DSA', name: 'Data Structures' },
  batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
  semester: {
    id: 'semester-a',
    name: 'Semester 2026',
    campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
  },
  examWindows: [
    {
      id: 'exam-mid',
      name: 'Mid-term',
      type: 'MID_TERM',
      startDate: '2026-10-12',
      endDate: '2026-10-16',
      syllabusDeadline: '2026-10-09',
    },
  ],
  plans: [
    {
      id: 'plan-a',
      version: 1,
      status: 'DRAFT',
      fileName: 'sample.csv',
      summary: { units: 1, topics: 2, totalPlannedMinutes: 300 },
    },
  ],
  plan: {
    id: 'plan-a',
    version: 1,
    status: 'DRAFT',
    fileName: 'sample.csv',
    uploadedBy: { id: 'user-a', name: 'Faculty', email: 'faculty@mirai.local' },
    approvedBy: null,
    approvedAt: null,
    createdAt: '2026-10-07T00:00:00.000Z',
    summary: { units: 1, topics: 2, totalPlannedMinutes: 300 },
    units: [
      {
        id: 'unit-a',
        sequence: 1,
        title: 'Linear structures',
        description: 'Core structures',
        topics: [
          {
            id: 'topic-a',
            sequence: 1,
            title: 'Arrays',
            description: 'Array operations',
            plannedMinutes: 120,
            status: 'NOT_STARTED',
            currentCompletionPercentage: 0,
            examScopes: [{ id: 'exam-mid', name: 'Mid-term' }],
          },
          {
            id: 'topic-b',
            sequence: 2,
            title: 'Linked Lists',
            description: null,
            plannedMinutes: 180,
            status: 'NOT_STARTED',
            currentCompletionPercentage: 0,
            examScopes: [],
          },
        ],
      },
    ],
  },
};

const offerings = [
  {
    id: 'offering-a',
    subject: detail.subject,
    batch: { ...detail.batch, semester: detail.semester },
    plan: {
      id: 'plan-a',
      version: 1,
      status: 'DRAFT',
      units: 1,
      topics: 2,
      totalPlannedMinutes: 300,
    },
  },
];

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWorkspace() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LessonPlanWorkspace />
    </QueryClientProvider>,
  );
}

function installFetchMock(
  onRequest?: (url: string, init?: RequestInit) => void,
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    onRequest?.(url, init);
    if (url.endsWith('/lesson-plans/offerings')) return json(offerings);
    if (url.endsWith('/lesson-plans/offerings/offering-a')) return json(detail);
    if (url.endsWith('/preview')) {
      return json({
        valid: true,
        fileName: 'plan.csv',
        counts: { rows: 2, units: 1, topics: 2, totalPlannedMinutes: 300 },
        issues: [],
      });
    }
    if (url.endsWith('/import')) return json({ planId: 'plan-b', version: 2 });
    if (init?.method === 'PATCH' || init?.method === 'PUT') return json({});
    if (url.endsWith('/activate'))
      return json({ id: 'plan-a', status: 'ACTIVE' });
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
  });
}

describe('LessonPlanWorkspace', () => {
  it('shows plan hours, editable topics and topic-level exam scope', async () => {
    installFetchMock();
    renderWorkspace();

    expect(await screen.findByText('Data Structures')).toBeInTheDocument();
    expect(await screen.findByText('Planned teaching')).toBeInTheDocument();
    expect(screen.getAllByText('5h').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Arrays')).toBeInTheDocument();
    expect(screen.getByText('Mid-term')).toBeInTheDocument();
    expect(screen.getByText('1/2 topics')).toBeInTheDocument();
  });

  it('previews a valid file before importing a new version', async () => {
    const requests: string[] = [];
    installFetchMock((url) => requests.push(url));
    renderWorkspace();
    const input = await screen.findByLabelText('Lesson-plan file');
    const file = new File(['sample'], 'plan.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Ready to import')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import new version' }));
    await waitFor(() =>
      expect(requests.some((url) => url.endsWith('/import'))).toBe(true),
    );
  });

  it('submits topic duration edits and a changed exam scope', async () => {
    const writes: Array<{ url: string; body: unknown }> = [];
    installFetchMock((url, init) => {
      if (init?.method === 'PATCH' || init?.method === 'PUT') {
        writes.push({ url, body: JSON.parse(String(init.body)) });
      }
    });
    renderWorkspace();

    const minutes = await screen.findByLabelText('Arrays planned minutes');
    fireEvent.change(minutes, { target: { value: '150' } });
    const topicForm = minutes.closest('form');
    expect(topicForm).not.toBeNull();
    fireEvent.submit(topicForm!);
    await waitFor(() =>
      expect(writes).toContainEqual({
        url: expect.stringContaining('/lesson-plans/topics/topic-a'),
        body: {
          title: 'Arrays',
          description: 'Array operations',
          plannedMinutes: 150,
        },
      }),
    );

    const scope = screen.getByText('Mid-term').closest('details');
    const checkboxes = within(scope!).getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(
      within(scope!).getByRole('button', { name: 'Save Mid-term scope' }),
    );
    await waitFor(() =>
      expect(writes).toContainEqual({
        url: expect.stringContaining(
          '/lesson-plans/plans/plan-a/exam-scopes/exam-mid',
        ),
        body: { topicIds: ['topic-a', 'topic-b'] },
      }),
    );
  });
});
