import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressDashboard } from './ProgressDashboard';
import { ProgressDashboardData } from './progress';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDashboard(scope: 'faculty' | 'manager' = 'manager') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProgressDashboard scope={scope} />
    </QueryClientProvider>,
  );
}

describe('M11 progress dashboard', () => {
  it('shows every required metric for campus, track and subject views', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(dashboard),
    );
    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: 'Main Campus' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Mirai Track' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Data Structures' }),
    ).toBeInTheDocument();
    for (const label of [
      'Planned hours',
      'Covered hours',
      'Coverage',
      'Remaining hours',
      'Available hours',
      'Planned by today',
      'Buffer ratio',
      'Pace vs plan',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('makes the worst-subject roll-up rule and danger result explicit', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(dashboard),
    );
    renderDashboard();

    expect(
      await screen.findByText(/worst visible subject, never an average/i),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText('DANGER')).length,
    ).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('2.13×').length).toBeGreaterThanOrEqual(3);
  });

  it('reloads the calculation when the reporting date changes', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(dashboard));
    renderDashboard('faculty');
    await screen.findByRole('heading', { name: 'Data Structures' });

    fireEvent.change(screen.getByLabelText('Position as of'), {
      target: { value: '2026-10-15' },
    });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/progress/dashboard?asOf=2026-10-15'),
        expect.objectContaining({
          credentials: 'include',
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });

  it('filters subject cards without changing the server roll-ups', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(dashboard),
    );
    renderDashboard();
    await screen.findByRole('heading', { name: 'Data Structures' });

    fireEvent.change(screen.getByLabelText('Find a subject'), {
      target: { value: 'physics' },
    });

    expect(
      screen.queryByRole('heading', { name: 'Data Structures' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('No subjects match that search.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Main Campus' }),
    ).toBeInTheDocument();
  });
});

const metrics = {
  hoursInScope: 100,
  coveredHours: 85,
  coveragePercentage: 85,
  remainingHours: 15,
  availableHours: 32,
  plannedHoursByToday: 82,
  paceVsPlanHours: 3,
  bufferRatio: 2.13,
  status: 'DANGER' as const,
};

const rollup = {
  ...metrics,
  subjectCount: 2,
  overdueTopics: 1,
  statusCounts: { ON_TRACK: 1, TIGHT: 0, DANGER: 1, COMPLETE: 0 },
};

const dashboard: ProgressDashboardData = {
  asOfDate: '2026-10-08',
  summary: rollup,
  campuses: [{ id: 'campus-a', code: 'MAIN', name: 'Main Campus', ...rollup }],
  tracks: [{ id: 'track-a', code: 'MIRAI', name: 'Mirai Track', ...rollup }],
  subjects: [
    {
      id: 'offering-a',
      targetFinishDate: '2026-11-30',
      subject: {
        id: 'subject-a',
        code: 'CS-DSA',
        name: 'Data Structures',
      },
      batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
      track: { id: 'track-a', code: 'MIRAI', name: 'Mirai Track' },
      campus: { id: 'campus-a', code: 'MAIN', name: 'Main Campus' },
      semester: { id: 'semester-a', name: 'Semester 2026' },
      lessonPlan: { id: 'plan-a', version: 1, status: 'ACTIVE' },
      scheduleVersion: 4,
      thresholds: { onTrack: 1.15, tight: 1 },
      ...metrics,
      overdueTopics: [
        {
          id: 'topic-b',
          title: 'Linked Lists',
          plannedFinishDate: '2026-10-01',
          completionPercentage: 50,
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
