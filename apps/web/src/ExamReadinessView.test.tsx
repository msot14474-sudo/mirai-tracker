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
import { ExamReadinessView } from './ExamReadinessView';
import {
  ExamReadinessData,
  ExamReadinessExam,
  ExamReadinessSubject,
} from './examReadiness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExamReadinessView />
    </QueryClientProvider>,
  );
}

describe('M12 exam readiness view', () => {
  it('shows the upcoming mid-term and end-term with their dates', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(data),
    );
    renderView();

    expect(
      await screen.findByRole('heading', { name: 'Mid-term 2026' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'End-term 2026' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sessional 1')).not.toBeInTheDocument();
    expect(screen.getByText('4 days to exam')).toBeInTheDocument();
  });

  it('shows correct in-scope coverage and hours still needed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(data),
    );
    renderView();
    const midHeading = await screen.findByRole('heading', {
      name: 'Mid-term 2026',
    });
    const card = midHeading.closest('article')!;

    expect(
      within(card).getByText('Teaching hours covered'),
    ).toBeInTheDocument();
    expect(within(card).getByText('50%')).toBeInTheDocument();
    expect(within(card).getByText('Topic completion')).toBeInTheDocument();
    expect(within(card).getAllByText('70%').length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText('Hours still needed')).toBeInTheDocument();
    expect(within(card).getAllByText('1.5h').length).toBeGreaterThanOrEqual(1);
    expect(within(card).getByText('5h')).toBeInTheDocument();
  });

  it('lists only topics mapped to each exam scope', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(data),
    );
    renderView();
    const midCard = (
      await screen.findByRole('heading', { name: 'Mid-term 2026' })
    ).closest('article')!;
    const endCard = screen
      .getByRole('heading', { name: 'End-term 2026' })
      .closest('article')!;

    expect(within(midCard).getByText('Arrays')).toBeInTheDocument();
    expect(within(midCard).getByText('Linked Lists')).toBeInTheDocument();
    expect(within(midCard).queryByText('Queues')).not.toBeInTheDocument();
    expect(within(endCard).getByText('Queues')).toBeInTheDocument();
  });

  it('reloads readiness for a changed reporting date', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(data));
    renderView();
    await screen.findByRole('heading', { name: 'Mid-term 2026' });

    fireEvent.change(screen.getByLabelText('Readiness as of'), {
      target: { value: '2026-10-10' },
    });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/progress/exam-readiness?asOf=2026-10-10'),
        expect.objectContaining({
          credentials: 'include',
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });
});

const topics = [
  {
    id: 'topic-a',
    title: 'Arrays',
    plannedMinutes: 120,
    status: 'COMPLETED' as const,
    completionPercentage: 100,
  },
  {
    id: 'topic-b',
    title: 'Linked Lists',
    plannedMinutes: 180,
    status: 'IN_PROGRESS' as const,
    completionPercentage: 50,
  },
];

const dsaSubject: ExamReadinessSubject = {
  id: 'offering-a',
  subject: {
    id: 'subject-a',
    code: 'CS-DSA',
    name: 'Data Structures',
  },
  batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
  track: { id: 'track-a', code: 'MIRAI', name: 'Mirai Track' },
  lessonPlan: { id: 'plan-a', version: 1, status: 'ACTIVE' },
  topicsInScope: 2,
  completedTopics: 1,
  plannedHours: 5,
  coveredHours: 3.5,
  coveragePercentage: 70,
  hoursStillNeeded: 1.5,
  topics,
};

const midTerm: ExamReadinessExam = {
  id: 'exam-mid',
  name: 'Mid-term 2026',
  type: 'MID_TERM',
  startDate: '2026-10-12',
  endDate: '2026-10-16',
  syllabusDeadline: '2026-10-09',
  daysUntilExam: 4,
  deadlinePassed: false,
  semester: { id: 'semester-a', name: 'Semester 2026' },
  campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
  topicsInScope: 2,
  completedTopics: 1,
  plannedHours: 5,
  coveredHours: 3.5,
  coveragePercentage: 70,
  hoursStillNeeded: 1.5,
  subjects: [dsaSubject],
};

const endTerm: ExamReadinessExam = {
  ...midTerm,
  id: 'exam-end',
  name: 'End-term 2026',
  type: 'END_TERM',
  startDate: '2026-12-07',
  endDate: '2026-12-12',
  syllabusDeadline: '2026-12-04',
  daysUntilExam: 60,
  topicsInScope: 3,
  plannedHours: 6,
  coveragePercentage: 58.33,
  hoursStillNeeded: 2.5,
  subjects: [
    {
      ...dsaSubject,
      topicsInScope: 3,
      plannedHours: 6,
      coveragePercentage: 58.33,
      hoursStillNeeded: 2.5,
      topics: [
        ...topics,
        {
          id: 'topic-c',
          title: 'Queues',
          plannedMinutes: 60,
          status: 'NOT_STARTED',
          completionPercentage: 0,
        },
      ],
    },
  ],
};

const data: ExamReadinessData = {
  asOfDate: '2026-10-08',
  exams: [midTerm, endTerm],
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
