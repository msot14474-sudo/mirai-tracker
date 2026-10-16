import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { CourseProgressImport } from './CourseProgressImport';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([true, false])(
  'shows every source column, explains blocked imports and invalidates changed previews (valid=%s)',
  async (valid) => {
    const mapping = {
      sheet: 'Progress',
      header: 1,
      topic: 0,
      hours: 1,
      completion: -1,
      status: -1,
      plannedDate: -1,
      taughtDate: -1,
      percentScale: 'percent',
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, _init) => {
        const url = String(input);
        if (url.endsWith('/academic/campuses/campus-a/semesters'))
          return new Response(
            JSON.stringify([
              {
                id: 'term',
                name: 'Term',
                startDate: '2026-07-01',
                endDate: '2026-12-31',
                status: 'ACTIVE',
              },
            ]),
            { status: 200 },
          );
        const data = url.endsWith('/lesson-plans/offerings?campusId=campus-a')
          ? [
              {
                id: 'subject',
                subject: { name: 'Web' },
                batch: {
                  name: 'A',
                  semester: {
                    id: 'term',
                    name: 'Term',
                    campus: { name: 'Campus' },
                  },
                },
                plan: null,
              },
            ]
          : url.endsWith('/inspect')
            ? {
                sheets: [
                  {
                    name: 'Progress',
                    rows: [['Topic', 'Hours', 'Homework']],
                    totalRows: 2,
                  },
                ],
                mapping,
              }
            : url.endsWith('/preview')
              ? {
                  valid,
                  issues: valid
                    ? []
                    : [
                        'Row 3: Date 2026-08-24 is outside the selected semester.',
                      ],
                  source: {
                    sheet: 'Progress',
                    header: 1,
                    columns: [
                      { index: 0, name: 'Topic', destination: 'Topic name' },
                      { index: 1, name: 'Hours', destination: 'Planned hours' },
                      {
                        index: 2,
                        name: 'Homework',
                        destination: 'Topic notes',
                      },
                    ],
                    rows: [
                      {
                        row: 2,
                        values: ['HTML', '1.5', 'Practice HTML'],
                        kind: valid ? 'Topic' : 'Needs correction',
                      },
                    ],
                  },
                  topics: [
                    {
                      title: 'HTML',
                      minutes: 90,
                      completion: 100,
                      description: 'Source',
                    },
                  ],
                  preserved: [],
                  counts: {
                    topics: 1,
                    completed: 1,
                    minutes: 90,
                    nonTeachingRows: 0,
                  },
                }
              : {};
        return new Response(JSON.stringify(data), { status: 200 });
      });
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <CourseProgressImport campusId="campus-a" />
      </QueryClientProvider>,
    );
    expect(
      screen.getByLabelText('2. Choose your progress file'),
    ).toBeDisabled();
    await screen.findByRole('option', {
      name: 'Term · 2026-07-01 to 2026-12-31',
    });
    fireEvent.change(screen.getByLabelText('1. Choose a semester'), {
      target: { value: 'term' },
    });
    fireEvent.change(screen.getByLabelText('2. Choose your progress file'), {
      target: {
        files: [
          new File(['Topic,Hours\nHTML,1.5'], 'progress.csv', {
            type: 'text/csv',
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read file' }));
    await screen.findByText('4. Check the columns');
    fireEvent.change(
      screen.getByLabelText('Subject and batch in this semester'),
      { target: { value: 'subject' } },
    );
    expect(
      screen.queryByRole('button', { name: 'Confirm progress import' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview progress' }));
    const confirm = await screen.findByRole('button', {
      name: 'Confirm progress import',
    });
    if (valid) expect(confirm).toBeEnabled();
    else {
      expect(confirm).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Row 3: Date 2026-08-24',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Import is disabled',
      );
    }
    expect(
      screen.getByRole('region', { name: 'Complete source data' }),
    ).toHaveTextContent('Homework');
    expect(screen.getByText('Practice HTML')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Include column 1: Topic' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Include column 2: Hours' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Include column 3: Homework' }),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Include column 3: Homework' }),
    ).not.toBeChecked();
    expect(screen.getByText('Excluded — not saved')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm progress import' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview progress' }));
    await screen.findByRole('button', { name: 'Confirm progress import' });
    const previews = fetch.mock.calls.filter(([url]) =>
      String(url).endsWith('/preview'),
    );
    const formData = previews.at(-1)?.[1]?.body as FormData;
    expect(formData.get('semesterId')).toBe('term');
    expect(JSON.parse(String(formData.get('mapping'))).excludedColumns).toEqual(
      [2],
    );
    fireEvent.change(screen.getByLabelText('Completion values'), {
      target: { value: 'fraction' },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Confirm progress import' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).endsWith('/imports/progress'),
      ),
    ).toBe(false);
  },
);

it('creates and selects a semester before allowing file upload', async () => {
  let created = false;
  const semester = {
    id: 'term-new',
    name: 'Semester One',
    startDate: '2026-07-01',
    endDate: '2026-12-31',
    status: 'DRAFT',
  };
  const requests: unknown[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).endsWith('/academic/campuses/campus-a/semesters')) {
      if (init?.method === 'POST') {
        created = true;
        requests.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(semester), { status: 200 });
      }
      return new Response(JSON.stringify(created ? [semester] : []), {
        status: 200,
      });
    }
    return new Response('[]', { status: 200 });
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CourseProgressImport campusId="campus-a" />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText('2. Choose your progress file')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Create a semester' }));
  fireEvent.change(screen.getByLabelText('Semester name'), {
    target: { value: 'Semester One' },
  });
  fireEvent.change(screen.getByLabelText('Semester starts'), {
    target: { value: '2026-07-01' },
  });
  fireEvent.change(screen.getByLabelText('Semester ends'), {
    target: { value: '2026-12-31' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create and select semester' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('1. Choose a semester')).toHaveValue(
      'term-new',
    ),
  );
  expect(screen.getByLabelText('2. Choose your progress file')).toBeEnabled();
  expect(requests).toEqual([
    {
      name: 'Semester One',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      workingSaturdayRule: 'NONE',
    },
  ]);
});
