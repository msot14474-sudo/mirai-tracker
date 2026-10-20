import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SemesterSetup } from './SemesterSetup';
import { academicApi } from './academic';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function renderSetup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SemesterSetup initialCampusId="campus-a" />
    </QueryClientProvider>,
  );
}

describe('SemesterSetup subjects', () => {
  it('shows a saved subject and its count even when an older read finishes late and the refresh fails', async () => {
    let submitted: unknown;
    let subjectReads = 0;
    let resolveOldRead!: (response: Response) => void;
    const oldRead = new Promise<Response>((resolve) => {
      resolveOldRead = resolve;
    });
    const read = vi
      .spyOn(academicApi, 'subjects')
      .mockImplementation(async () => {
        subjectReads++;
        if (subjectReads === 1) return (await oldRead).json();
        throw new Error('Could not refresh subjects.');
      });
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
        return json([{ id: 'term', name: 'Semester 1', status: 'ACTIVE' }]);
      }
      if (url.endsWith('/academic/semesters/term/subjects'))
        return json([
          {
            id: 'batch',
            name: 'First Year A',
            code: 'A',
            track: { name: 'CS' },
            subjectOfferings: [],
          },
        ]);
      if (
        url.endsWith('/academic/subjects?campusId=campus-a') &&
        (init?.method ?? 'GET') === 'GET'
      ) {
        throw new Error('Subject reads use the deferred API mock.');
      }
      if (url.endsWith('/academic/subjects') && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body));
        const created = {
          id: 'subject-a',
          ...(submitted as object),
          active: true,
          offerings: [
            {
              id: 'offering',
              batch: { name: 'First Year A', semester: { name: 'Semester 1' } },
              faculty: [],
            },
          ],
          teachers: [],
        };
        return json(created);
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });

    renderSetup();
    expect(screen.queryByLabelText('Campus')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subjects' }));

    await screen.findByRole('heading', { name: 'Subject catalog' });
    expect(screen.queryByLabelText('Campus')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Subject code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add subject' }));
    await screen.findByRole('option', { name: 'First Year A' });
    fireEvent.change(screen.getByLabelText('Batch'), {
      target: { value: 'batch' },
    });
    fireEvent.change(screen.getByLabelText('Subject track'), {
      target: { value: 'MIRAI' },
    });
    fireEvent.change(screen.getByLabelText('Subject code'), {
      target: { value: 'cs-dsa' },
    });
    fireEvent.change(screen.getByLabelText('Subject name'), {
      target: { value: 'Data Structures and Algorithms' },
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: 'Core subject' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add subject' }));

    await waitFor(() =>
      expect(submitted).toEqual({
        campusId: 'campus-a',
        semesterId: 'term',
        batchId: 'batch',
        trackCode: 'MIRAI',
        trackName: 'Mirai',
        code: 'cs-dsa',
        name: 'Data Structures and Algorithms',
        description: 'Core subject',
      }),
    );
    expect(
      await screen.findByText('Data Structures and Algorithms'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Data Structures and Algorithms added.'),
    ).toHaveTextContent('Data Structures and Algorithms added.');
    expect(screen.getByText('1 subject')).toBeInTheDocument();
    expect(screen.getByText('First Year A')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Assign teacher' }),
    ).toBeInTheDocument();
    await act(async () => {
      resolveOldRead(json([]));
    });
    await screen.findByText('Could not refresh subjects.');
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByText('1 subject')).toBeInTheDocument();
    expect(
      screen.queryByText('No subjects added yet.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Data Structures and Algorithms'),
    ).toBeInTheDocument();
  });
});

it('shows all semester dates, including ordinary weekdays after the first eight days', async () => {
  const semester = {
    id: 'term',
    campusId: 'campus-a',
    name: 'Term',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    workingSaturdayRule: 'NONE',
    status: 'ACTIVE',
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/academic/campuses'))
      return json([
        { id: 'campus-a', name: 'Campus', code: 'C', timezone: 'Asia/Kolkata' },
      ]);
    if (url.endsWith('/semesters')) return json([semester]);
    if (url.endsWith('/calendar'))
      return json({
        semester,
        summary: { totalDays: 10, workingDays: 10, nonWorkingDays: 0 },
        days: Array.from({ length: 10 }, (_, i) => ({
          date: `2026-09-${String(i + 1).padStart(2, '0')}`,
          weekday: 'MONDAY',
          working: true,
          reason: 'WEEKDAY',
          override: null,
        })),
        exams: [],
      });
    if (url.endsWith('/subjects')) return json([]);
    throw new Error(url);
  });
  renderSetup();
  await screen.findByText('1 semester in this campus');
  expect(screen.queryByLabelText('Semester name')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add semester' }));
  expect(screen.getByLabelText('Semester name')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Semester name')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /Term 2026/ }));
  await screen.findByRole('region', { name: 'All semester dates' });
  expect(
    document.querySelector('time[datetime="2026-09-10"]'),
  ).toBeInTheDocument();
  expect(
    screen
      .getByRole('region', { name: 'All semester dates' })
      .querySelectorAll('time'),
  ).toHaveLength(10);
});

it('only deletes a semester after confirmation and refreshes the list', async () => {
  let deleted = false;
  const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (
      url.endsWith('/academic/semesters/semester-a') &&
      init?.method === 'DELETE'
    ) {
      deleted = true;
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/academic/campuses/campus-a/semesters'))
      return json(
        deleted
          ? []
          : [
              {
                id: 'semester-a',
                name: 'Autumn',
                startDate: '2026-08-01',
                endDate: '2026-12-01',
                workingSaturdayRule: 'NONE',
              },
            ],
      );
    throw new Error(`Unexpected request ${url}`);
  });
  renderSetup();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete semester Autumn' }),
  );
  expect(deleted).toBe(false);
  confirmation.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Delete semester Autumn' }),
  );
  await screen.findByText('0 semesters in this campus');
  expect(deleted).toBe(true);
});

it('loads an existing date and updates it instead of creating a duplicate', async () => {
  const semester = {
    id: 'semester-a',
    name: 'Autumn',
    startDate: '2026-08-01',
    endDate: '2026-12-01',
    workingSaturdayRule: 'NONE',
  };
  let update: unknown;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/academic/campuses/campus-a/semesters'))
      return json([semester]);
    if (url.endsWith('/academic/semesters/semester-a/calendar'))
      return json({
        semester,
        summary: { totalDays: 1, workingDays: 0, nonWorkingDays: 1 },
        exams: [],
        days: [
          {
            date: '2026-09-01',
            weekday: 'TUESDAY',
            working: false,
            reason: 'HOLIDAY',
            override: {
              id: 'day-a',
              title: 'Holiday',
              type: 'HOLIDAY',
              teachingAllowed: false,
            },
          },
        ],
      });
    if (
      url.endsWith('/academic/calendar-days/day-a') &&
      init?.method === 'PATCH'
    ) {
      update = JSON.parse(String(init.body));
      return json({ id: 'day-a' });
    }
    throw new Error(`Unexpected ${init?.method} ${url}`);
  });
  renderSetup();
  fireEvent.click(await screen.findByRole('button', { name: /^Autumn/ }));
  await screen.findByRole('heading', { name: 'Update calendar date' });
  fireEvent.change(screen.getByLabelText('Date'), {
    target: { value: '2026-09-01' },
  });
  expect(screen.getByLabelText('Title')).toHaveValue('Holiday');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Campus event' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Update date' }));
  await screen.findByText('Calendar date updated.');
  expect(update).toEqual({
    title: 'Campus event',
    type: 'HOLIDAY',
    teachingAllowed: false,
  });
});
