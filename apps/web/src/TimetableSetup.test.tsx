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

function installFetchMock(
  onCreate?: (body: unknown) => void,
  onUpdate?: (body: unknown) => void,
  onExtra?: (body: unknown) => void,
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/extra-classes') && init?.method === 'POST') {
      onExtra?.(JSON.parse(String(init.body)));
      return json({
        sessionId: 'extra-class',
        plannedMinutes: 90,
        warnings: [],
      });
    }
    if (
      url.endsWith('/timetable/entries/entry-a') &&
      init?.method === 'PATCH'
    ) {
      onUpdate?.(JSON.parse(String(init.body)));
      return json({ entry: offeringDetail.entries[0], generation: {} });
    }
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
  it('prefills an existing class and saves edits to that entry', async () => {
    const update = vi.fn();
    installFetchMock(undefined, update);
    renderTimetable();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Monday 09:00 class' }),
    );
    expect(screen.getByLabelText('End time')).toHaveValue('11:00');
    expect(screen.getByLabelText('Teacher (optional)')).toHaveValue(
      'assignment-a',
    );
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '09:30' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save timetable changes' }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        weekday: 1,
        startTime: '09:30',
        endTime: '11:00',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-03-31',
        facultyAssignmentId: 'assignment-a',
      }),
    );
  });
  it('offers a single extra class and refreshes the subject after saving', async () => {
    const extra = vi.fn();
    // Use an upcoming semester so the date picker remains valid.
    const future = { startDate: '2030-01-01', endDate: '2030-03-31' };
    const old = {
      startDate: offeringDetail.semester.startDate,
      endDate: offeringDetail.semester.endDate,
    };
    Object.assign(offeringDetail.semester, future);
    try {
      installFetchMock(undefined, undefined, extra);
      renderTimetable();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Extra class' }),
      );
      expect(screen.queryByLabelText('Repeat from')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Class date'), {
        target: { value: '2030-01-07' },
      });
      fireEvent.change(screen.getByLabelText('Extra class start time'), {
        target: { value: '14:00' },
      });
      fireEvent.change(screen.getByLabelText('Extra class end time'), {
        target: { value: '15:30' },
      });
      fireEvent.change(screen.getByLabelText('Reason (optional)'), {
        target: { value: 'Revision' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add extra class' }));
      await waitFor(() =>
        expect(extra).toHaveBeenCalledWith({
          date: '2030-01-07',
          startTime: '14:00',
          endTime: '15:30',
          facultyAssignmentId: null,
          reason: 'Revision',
        }),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Extra class added',
      );
    } finally {
      Object.assign(offeringDetail.semester, old);
    }
  });

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

    expect((await screen.findAllByText('Foundations'))[0]).toBeInTheDocument();
    expect(await screen.findByText('Hours per week')).toBeInTheDocument();
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

    await screen.findByRole('heading', { name: '2. Add a weekly class' });
    fireEvent.change(screen.getByLabelText('Day of the week'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '14:00' },
    });
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '15:30' },
    });
    fireEvent.change(screen.getByLabelText('Teacher (optional)'), {
      target: { value: 'assignment-a' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save weekly class' }));

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
