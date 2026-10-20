import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarFileImport } from './CalendarFileImport';
import { academicApi } from './academic';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps an HTTP error out of the preview and allows retrying', async () => {
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      id: 'semester',
      name: 'Autumn',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      campusId: 'campus',
      status: 'ACTIVE',
    },
  ]);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ message: 'Calendar service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CalendarFileImport campusId="campus" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'), {
    target: { value: 'semester' },
  });
  fireEvent.change(screen.getByLabelText('2. Upload calendar'), {
    target: { files: [new File(['date,title'], 'calendar.csv')] },
  });
  fireEvent.click(screen.getByText('Read and verify calendar'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
  expect(screen.queryByText('Save calendar changes')).not.toBeInTheDocument();
  expect(screen.getByText('Read and verify calendar')).toBeEnabled();
});
it('requires verification and review, supports deleting extracted entries before saving', async () => {
  const entries = ['Holiday', 'Optional event'].map((title, i) => ({
    title,
    start: `2026-10-0${i + 2}`,
    end: `2026-10-0${i + 2}`,
    kind: 'HOLIDAY',
    teachingAllowed: false,
    examType: 'OTHER',
    evidence: 'October holiday',
    concern: '',
  }));
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const url = String(input);
      const value = url.includes('/semesters')
        ? [
            {
              id: 'semester',
              name: 'Autumn',
              startDate: '2026-07-01',
              endDate: '2026-12-31',
              workingSaturdayRule: 'SECOND_AND_FOURTH',
            },
          ]
        : url.endsWith('/commit')
          ? { saved: true, message: 'Saved calendar' }
          : {
              token: 'token',
              entries,
              warnings: [],
              verified: url.endsWith('/verify'),
            };
      return new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CalendarFileImport campusId="campus" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'), {
    target: { value: 'semester' },
  });
  fireEvent.change(screen.getByLabelText('2. Upload calendar'), {
    target: { files: [new File(['date,title'], 'calendar.csv')] },
  });
  fireEvent.click(screen.getByText('Read and verify calendar'));
  await screen.findByText(/AI reading and verification completed/);
  const save = screen.getByText('Save calendar changes') as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getAllByText('Remove entry')[1]!);
  fireEvent.click(screen.getByLabelText(/I checked the source/));
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await screen.findByText('Saved calendar');
  const call = fetch.mock.calls.find(([url]) =>
    String(url).endsWith('/commit'),
  );
  expect(JSON.parse(String(call?.[1]?.body)).entries).toHaveLength(1);
  expect(
    fetch.mock.calls.some(([url]) => String(url).endsWith('/verify')),
  ).toBe(true);
});

it('shows direct CSV verification without making an AI request', async () => {
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      id: 'semester',
      name: 'Autumn',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      campusId: 'campus',
      status: 'ACTIVE',
    },
  ]);
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        token: 'token',
        entries: [],
        warnings: [],
        method: 'direct',
        verified: true,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarFileImport campusId="campus" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'), {
    target: { value: 'semester' },
  });
  fireEvent.change(screen.getByLabelText('2. Upload calendar'), {
    target: { files: [new File(['Date,Event'], 'calendar.csv')] },
  });
  fireEvent.click(screen.getByText('Read and verify calendar'));
  await screen.findByText(/Spreadsheet dates and events read directly/);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps the file total visible after removing dates outside the selected semester', async () => {
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      id: 'semester',
      name: 'Autumn',
      startDate: '2026-08-08',
      endDate: '2026-12-08',
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      campusId: 'campus',
      status: 'ACTIVE',
    },
  ]);
  const entries = Array.from({ length: 42 }, (_, i) => ({
    title: `Entry ${i + 1}`,
    start: new Date(
      Date.parse(i < 11 ? '2026-07-01' : '2026-08-08') +
        (i < 11 ? i : i - 11) * 86400000,
    )
      .toISOString()
      .slice(0, 10),
    kind: 'HOLIDAY',
    teachingAllowed: false,
    examType: 'OTHER',
    evidence: '',
    concern: '',
  })).map((entry) => ({ ...entry, end: entry.start }));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        token: 'token',
        entries,
        warnings: [],
        verified: true,
        method: 'ai',
        sourceCounts: {
          total: 42,
          withinSemester: 31,
          outsideSemester: 11,
          crossingBoundary: 0,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarFileImport campusId="campus" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'), {
    target: { value: 'semester' },
  });
  fireEvent.change(screen.getByLabelText('2. Upload calendar'), {
    target: { files: [new File(['Date,Event'], 'calendar.xlsx')] },
  });
  fireEvent.click(screen.getByText('Read and verify calendar'));
  await screen.findByText('Review 42 selected entries');
  fireEvent.click(screen.getByText('Remove 11 entries outside semester'));
  expect(screen.getByText('Review 31 selected entries')).toBeInTheDocument();
  expect(screen.getByText('42 entries')).toBeInTheDocument();
  expect(screen.getByText(/31 within this semester/)).toHaveTextContent(
    /11 outside/,
  );
  expect(screen.getByText(/AI cross-check completed/)).toBeInTheDocument();
});

it('automatically continues sections and resumes verification after a failure', async () => {
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      id: 'semester',
      name: 'Autumn',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      campusId: 'campus',
      status: 'ACTIVE',
    },
  ]);
  const base = {
    token: 'token',
    entries: [],
    warnings: [],
    method: 'ai',
    verified: false,
  };
  const response = (completed: number, verified = false) =>
    new Response(
      JSON.stringify({
        ...base,
        verified,
        progress: {
          completed,
          total: 4,
          section: Math.floor(completed / 2) + 1,
          sections: 2,
          phase: completed % 2 ? 'checking' : 'reading',
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response(0))
    .mockResolvedValueOnce(response(1))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: 'AI is busy; retry verification' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    .mockResolvedValueOnce(response(2))
    .mockResolvedValueOnce(response(3))
    .mockResolvedValueOnce(response(4, true));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarFileImport campusId="campus" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'), {
    target: { value: 'semester' },
  });
  fireEvent.change(screen.getByLabelText('2. Upload calendar'), {
    target: { files: [new File(['calendar'], 'calendar.pdf')] },
  });
  fireEvent.click(screen.getByText('Read and verify calendar'));
  expect(await screen.findByRole('alert')).toHaveTextContent('AI is busy');
  expect(screen.queryByText('Save calendar changes')).not.toBeInTheDocument();
  expect(screen.queryByText('Add a missing date')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Continue verification'));
  await screen.findByText(/AI reading and verification completed/);
  expect(
    fetch.mock.calls.filter(([url]) => String(url).endsWith('/preview')),
  ).toHaveLength(1);
  expect(
    fetch.mock.calls.filter(([url]) => String(url).endsWith('/verify')),
  ).toHaveLength(5);
});

it('prefills missing exam deadlines, blocks invalid edits inline and saves a corrected date without a reload', async () => {
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      id: 'semester',
      name: 'Autumn',
      startDate: '2026-07-18',
      endDate: '2026-12-18',
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      campusId: 'campus',
      status: 'ACTIVE',
    },
  ]);
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/commit')
            ? { saved: true, message: 'Saved calendar' }
            : {
                token: 'token',
                verified: true,
                method: 'ai',
                warnings: [],
                entries: [
                  {
                    title: '1st Sessional',
                    kind: 'EXAM',
                    start: '2026-09-28',
                    end: '2026-09-30',
                    examType: 'SESSIONAL',
                    teachingAllowed: false,
                    evidence: 'Academic Calendar row 17',
                    concern: '',
                  },
                ],
              },
        ),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarFileImport campusId="campus" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'), {
    target: { value: 'semester' },
  });
  fireEvent.change(screen.getByLabelText('2. Upload calendar'), {
    target: { files: [new File(['calendar'], 'calendar.xlsx')] },
  });
  fireEvent.click(screen.getByText('Read and verify calendar'));
  await screen.findByText(/AI reading and verification completed/);
  expect(screen.getByLabelText(/Syllabus deadline/)).toHaveValue('2026-09-28');
  fireEvent.change(screen.getByLabelText(/Syllabus deadline/), {
    target: { value: '2026-10-02' },
  });
  expect(screen.getByText('1 entry needs attention')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/I checked the source/));
  expect(screen.getByText('Save calendar changes')).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Syllabus deadline/), {
    target: { value: '2026-09-27' },
  });
  expect(screen.queryByText('1 entry needs attention')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/I checked the source/)).not.toBeChecked();
  fireEvent.click(screen.getByText('Add a missing date'));
  fireEvent.change(screen.getAllByLabelText('Title')[1]!, {
    target: { value: 'College holiday' },
  });
  fireEvent.change(screen.getAllByLabelText('From')[1]!, {
    target: { value: '2026-10-02' },
  });
  expect(screen.getAllByLabelText('To')[1]).toHaveValue('2026-10-02');
  fireEvent.change(screen.getAllByLabelText('Type')[1]!, {
    target: { value: 'HOLIDAY' },
  });
  fireEvent.click(screen.getByLabelText(/I checked the source/));
  fireEvent.click(screen.getByText('Save calendar changes'));
  await screen.findByText('Saved calendar');
  const saved = JSON.parse(
    String(
      fetch.mock.calls.find(([url]) => String(url).endsWith('/commit'))?.[1]
        ?.body,
    ),
  );
  expect(saved.entries[0].deadline).toBe('2026-09-27');
  expect(saved.entries[1]).toMatchObject({
    start: '2026-10-02',
    end: '2026-10-02',
    teachingAllowed: false,
  });
});
