import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimetableSetup } from './TimetableSetup';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const semester = {
  id: 'semester-a',
  campusId: 'campus-a',
  name: 'Semester 2026',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  workingSaturdayRule: 'SECOND_AND_FOURTH',
  status: 'ACTIVE',
};

const offeringSummary = {
  semester,
  offerings: [
    {
      id: 'offering-a',
      subject: { id: 'subject-a', code: 'OT101', name: 'Foundations' },
      batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
      targetFinishDate: '2026-03-20',
      entries: [],
      weeklyPlannedMinutes: 120,
      generatedSessions: 10,
    },
  ],
};

const offeringDetail = {
  id: 'offering-a',
  subject: { id: 'subject-a', code: 'OT101', name: 'Foundations' },
  batch: { id: 'batch-a', code: 'A', name: 'Batch A' },
  semester: {
    ...semester,
    campus: {
      id: 'campus-a',
      code: 'HI-TECH',
      name: 'HI-Tech',
      timezone: 'Asia/Kolkata',
    },
  },
  facultyAssignments: [
    {
      id: 'assignment-a',
      type: 'PRIMARY',
      active: true,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      staff: {
        id: 'faculty-a',
        name: 'Sample Faculty',
        email: 'faculty@mirai.local',
      },
    },
  ],
  entries: [
    {
      id: 'entry-a',
      facultyAssignmentId: 'assignment-a',
      weekday: 1,
      startTime: '09:00',
      endTime: '11:00',
      plannedMinutes: 120,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
      active: true,
    },
  ],
  sessions: [
    {
      id: 'session-a',
      timetableEntryId: 'entry-a',
      sessionDate: '2026-01-05',
      startsAt: '2026-01-05T03:30:00.000Z',
      endsAt: '2026-01-05T05:30:00.000Z',
      plannedMinutes: 120,
      status: 'SCHEDULED',
    },
  ],
  summary: {
    weeklyPlannedMinutes: 120,
    generatedSessions: 10,
    semesterPlannedMinutes: 1200,
  },
};

function renderTimetable() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TimetableSetup />
    </QueryClientProvider>,
  );
}

function installFetchMock(onCreate?: (body: unknown) => void) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/academic/campuses')) {
      return json([
        {
          id: 'campus-a',
          code: 'HI-TECH',
          name: 'HI-Tech',
          timezone: 'Asia/Kolkata',
        },
      ]);
    }
    if (url.endsWith('/academic/campuses/campus-a/semesters')) {
      return json([semester]);
    }
    if (url.endsWith('/timetable/semesters/semester-a/offerings')) {
      return json(offeringSummary);
    }
    if (url.endsWith('/timetable/offerings/offering-a')) {
      return json(offeringDetail);
    }
    if (
      url.endsWith('/timetable/offerings/offering-a/entries') &&
      init?.method === 'POST'
    ) {
      onCreate?.(JSON.parse(String(init.body)));
      return json({ entry: offeringDetail.entries[0], generation: {} });
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
  });
}

describe('TimetableSetup', () => {
  it('shows loading skeletons instead of a premature selection prompt', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    renderTimetable();

    expect(
      screen.getByRole('status', { name: 'Loading subject offerings' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Loading timetable data' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Select a subject offering' }),
    ).not.toBeInTheDocument();
  });

  it('shows weekly, dated and semester planned teaching from the API', async () => {
    installFetchMock();
    renderTimetable();

    expect(await screen.findByText('Foundations')).toBeInTheDocument();
    expect(await screen.findByText('Weekly teaching')).toBeInTheDocument();
    expect(screen.getAllByText('2h').length).toBeGreaterThan(0);
    expect(screen.getByText('20h')).toBeInTheDocument();
    expect(screen.getByText('2026-01-05')).toBeInTheDocument();
    expect(screen.getByText('120 min')).toBeInTheDocument();
  });

  it('submits a weekly slot with its faculty and effective range', async () => {
    let submitted: unknown;
    installFetchMock((body) => {
      submitted = body;
    });
    renderTimetable();

    await screen.findByRole('heading', { name: 'Add weekly slot' });
    fireEvent.change(screen.getByLabelText('Day'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('Starts'), {
      target: { value: '14:00' },
    });
    fireEvent.change(screen.getByLabelText('Ends'), {
      target: { value: '15:30' },
    });
    fireEvent.change(screen.getByLabelText('Faculty'), {
      target: { value: 'assignment-a' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add and generate' }));

    await waitFor(() =>
      expect(submitted).toEqual({
        weekday: 4,
        startTime: '14:00',
        endTime: '15:30',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-03-31',
        facultyAssignmentId: 'assignment-a',
      }),
    );
  });
});
