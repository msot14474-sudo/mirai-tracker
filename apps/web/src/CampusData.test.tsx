import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { academicApi } from './academic';
import { FullSemesterImport } from './FullSemesterImport';
import { VisitingFacultyWorkspace } from './VisitingFacultyWorkspace';
import * as api from './campusData';
const semester = {
  id: 's1',
  campusId: 'campus',
  name: 'Autumn',
  startDate: '2025-01-01',
  endDate: '2025-06-30',
  workingSaturdayRule: 'SECOND_AND_FOURTH' as const,
  status: 'ACTIVE' as const,
};
function setup() {
  vi.spyOn(academicApi, 'campuses').mockResolvedValue([
    {
      id: 'campus',
      code: 'TEST',
      name: 'Test Campus',
      timezone: 'Asia/Kolkata',
    },
  ] as any);
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    semester,
    { ...semester, id: 's2', name: 'Spring' },
  ]);
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('requires a valid preview, imports exactly its fingerprint, and clears it on semester change', async () => {
  const client = setup();
  let valid = false;
  const request = vi
    .spyOn(api, 'campusRequest')
    .mockImplementation(async (path, init) => {
      if (path.endsWith('/imports')) return [] as any;
      if (path.endsWith('/import')) {
        expect((init!.body as FormData).get('fingerprint')).toBe(
          'validated-hash',
        );
        return { ...base, valid: true, importId: 'saved' } as any;
      }
      return {
        ...base,
        valid,
        issues: valid ? [] : [{ location: 'row 2', message: 'Wrong date' }],
      } as any;
    });
  const base = {
    fingerprint: 'validated-hash',
    alreadyImported: false,
    counts: { Calendar: 1 },
    warnings: [],
    skippedSheets: [],
    rows: [
      {
        dataset: 'Calendar',
        location: 'row 2',
        values: { date: '2025-01-01' },
      },
    ],
    issues: [],
  };
  render(
    <QueryClientProvider client={client}>
      <FullSemesterImport />
    </QueryClientProvider>,
  );
  const file = await screen.findByLabelText('Excel or CSV files');
  fireEvent.change(file, {
    target: { files: [new File(['date,title'], 'Calendar.csv')] },
  });
  fireEvent.click(screen.getByText('Preview import'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Wrong date');
  expect(screen.getByText('Confirm semester import')).toBeDisabled();
  valid = true;
  fireEvent.click(screen.getByText('Preview import'));
  await waitFor(() =>
    expect(screen.getByText('Confirm semester import')).toBeEnabled(),
  );
  fireEvent.click(screen.getByText('Confirm semester import'));
  await screen.findByText(/Semester data imported/);
  expect(
    request.mock.calls.some(([path]) => path === '/semesters/s1/import'),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Semester'), {
    target: { value: 's2' },
  });
  await waitFor(() =>
    expect(screen.queryByText('3. Review your import')).not.toBeInTheDocument(),
  );
  expect(screen.getByText('Preview import')).toBeDisabled();
});
it('shows incomplete financial totals and saves a per-class effective rate to the selected semester', async () => {
  const client = setup();
  const data = {
    semester: { name: 'Autumn', timezone: 'Asia/Kolkata' },
    summary: {
      faculty: 1,
      takenClasses: 2,
      teachingHours: 2,
      unpricedClasses: 2,
      honorarium: 0,
      expenses: 200,
      paid: 0,
      balance: 200,
    },
    unresolvedClasses: 0,
    faculty: [
      {
        id: 'teacher',
        name: 'Asha',
        email: 'asha@example.test',
        active: true,
        subjects: [{ name: 'Web', code: 'WEB', batch: 'A', active: true }],
        rates: [],
        takenClasses: 2,
        teachingHours: 2,
        honorarium: 0,
        expenses: 200,
        paid: 0,
        balance: 200,
        unpricedClasses: 2,
      },
    ],
    classes: [],
    ledger: [],
  };
  const request = vi.spyOn(api, 'campusRequest').mockResolvedValue(data as any);
  render(
    <QueryClientProvider client={client}>
      <VisitingFacultyWorkspace />
    </QueryClientProvider>,
  );
  await screen.findByText('2 classes need a rate.');
  fireEvent.click(screen.getByText('Set class rate'));
  fireEvent.change(screen.getByLabelText('Effective from'), {
    target: { value: '2025-01-01' },
  });
  fireEvent.change(screen.getByLabelText('Rate per class (INR)'), {
    target: { value: '1500' },
  });
  fireEvent.click(screen.getByText('Save record'));
  await screen.findByText(/Class rate saved/);
  const call = request.mock.calls.find(([path]) => path.endsWith('/rates'))!;
  expect(call[0]).toBe('/semesters/s1/visiting-faculty/rates');
  expect(JSON.parse(call[1]!.body as string)).toEqual({
    staffProfileId: 'teacher',
    effectiveFrom: '2025-01-01',
    ratePerClass: 1500,
  });
});
