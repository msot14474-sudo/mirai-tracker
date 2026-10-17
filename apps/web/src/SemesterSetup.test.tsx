import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SemesterSetup } from './SemesterSetup';

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
  it('adds a subject to the shared catalog', async () => {
    let submitted: unknown;
    let subjects: unknown[] = [];
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
        return json([]);
      }
      if (
        url.endsWith('/academic/subjects?campusId=campus-a') &&
        (init?.method ?? 'GET') === 'GET'
      ) {
        return json(subjects);
      }
      if (url.endsWith('/academic/subjects') && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body));
        const created = {
          id: 'subject-a',
          ...(submitted as object),
          active: true,
        };
        subjects = [created];
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
        code: 'cs-dsa',
        name: 'Data Structures and Algorithms',
        description: 'Core subject',
      }),
    );
    expect(
      await screen.findByText('Data Structures and Algorithms'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Data Structures and Algorithms added.',
    );
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
    if (url.endsWith('/academic/semesters/semester-a') && init?.method === 'DELETE') {
      deleted = true;
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/academic/campuses/campus-a/semesters')) return json(deleted ? [] : [{
      id: 'semester-a', name: 'Autumn', startDate: '2026-08-01', endDate: '2026-12-01', workingSaturdayRule: 'NONE',
    }]);
    throw new Error(`Unexpected request ${url}`);
  });
  renderSetup();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete semester Autumn' }));
  expect(deleted).toBe(false);
  confirmation.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Delete semester Autumn' }));
  await screen.findByText('0 semesters in this campus');
  expect(deleted).toBe(true);
});
