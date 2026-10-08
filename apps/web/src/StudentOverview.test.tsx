import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentOverview } from './StudentOverview';
import { StudentOverviewData } from './studentView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StudentOverview />
    </QueryClientProvider>,
  );
}

describe('M13 student overview', () => {
  it('shows the authenticated batch context and read-only state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(data));
    renderOverview();

    expect(await screen.findByText('Mirai Sample Batch A')).toBeInTheDocument();
    expect(screen.getByText('HI-Tech Campus')).toBeInTheDocument();
    expect(screen.getByText('Mirai Track')).toBeInTheDocument();
    expect(screen.getByText('READ ONLY')).toBeInTheDocument();
  });

  it('shows covered work and the ordered topics coming next', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(data));
    renderOverview();
    const subject = (
      await screen.findByRole('heading', { name: 'Data Structures' })
    ).closest('article')!;

    expect(within(subject).getByText('What we covered')).toBeInTheDocument();
    expect(within(subject).getByText('Coming next')).toBeInTheDocument();
    expect(within(subject).getByText('Arrays')).toBeInTheDocument();
    expect(within(subject).getAllByText('Linked Lists')).toHaveLength(2);
    expect(within(subject).getByText(/Planned 20 Oct/)).toBeInTheDocument();
    expect(within(subject).getByText('58.33%')).toBeInTheDocument();
  });

  it('shows upcoming exam dates and exact subject scope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(data));
    renderOverview();
    const exam = (
      await screen.findByRole('heading', { name: 'Mid-term 2026' })
    ).closest('article')!;

    expect(within(exam).getByText('4 DAYS')).toBeInTheDocument();
    expect(within(exam).getByText('12 Oct–16 Oct')).toBeInTheDocument();
    expect(within(exam).getByText('Syllabus scope')).toBeInTheDocument();
    expect(within(exam).getByText('Arrays')).toBeInTheDocument();
    expect(within(exam).getByText('Linked Lists')).toBeInTheDocument();
    expect(within(exam).queryByText('Queues')).not.toBeInTheDocument();
  });

  it('contains no editing controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(data));
    renderOverview();
    await screen.findByRole('heading', { name: 'My course progress' });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});

const arrays = {
  id: 'topic-a',
  unit: { sequence: 1, title: 'Linear structures' },
  sequence: 1,
  title: 'Arrays',
  plannedMinutes: 120,
  status: 'COMPLETED' as const,
  completionPercentage: 100,
  plannedStartDate: '2026-09-01',
  plannedFinishDate: '2026-09-05',
};

const linkedLists = {
  id: 'topic-b',
  unit: { sequence: 1, title: 'Linear structures' },
  sequence: 2,
  title: 'Linked Lists',
  plannedMinutes: 180,
  status: 'IN_PROGRESS' as const,
  completionPercentage: 50,
  plannedStartDate: '2026-10-01',
  plannedFinishDate: '2026-10-15',
};

const queues = {
  id: 'topic-c',
  unit: { sequence: 1, title: 'Linear structures' },
  sequence: 3,
  title: 'Queues',
  plannedMinutes: 60,
  status: 'NOT_STARTED' as const,
  completionPercentage: 0,
  plannedStartDate: '2026-10-20',
  plannedFinishDate: '2026-10-25',
};

const data: StudentOverviewData = {
  asOfDate: '2026-10-08',
  batch: {
    id: 'batch-a',
    code: 'MIRAI-A',
    name: 'Mirai Sample Batch A',
    track: { id: 'track-a', code: 'MIRAI', name: 'Mirai Track' },
    semester: {
      id: 'semester-a',
      name: 'Sample Semester 2026',
      campus: { id: 'campus-a', code: 'HI-TECH', name: 'HI-Tech Campus' },
    },
  },
  subjects: [
    {
      id: 'offering-a',
      subject: {
        id: 'subject-a',
        code: 'CS-DSA',
        name: 'Data Structures',
      },
      lessonPlan: { id: 'plan-a', version: 1, status: 'ACTIVE' },
      scheduleVersion: 4,
      plannedHours: 6,
      coveredHours: 3.5,
      coveragePercentage: 58.33,
      totalTopics: 3,
      completedTopics: 1,
      coveredTopics: [arrays, linkedLists],
      comingNextTopics: [linkedLists, queues],
    },
  ],
  exams: [
    {
      id: 'exam-mid',
      name: 'Mid-term 2026',
      type: 'MID_TERM',
      startDate: '2026-10-12',
      endDate: '2026-10-16',
      syllabusDeadline: '2026-10-09',
      daysUntilExam: 4,
      subjects: [
        {
          id: 'offering-a',
          subject: {
            id: 'subject-a',
            code: 'CS-DSA',
            name: 'Data Structures',
          },
          topics: [arrays, linkedLists],
        },
      ],
    },
  ],
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
