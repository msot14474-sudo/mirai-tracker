import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReportsWorkspace } from './ReportsWorkspace';
import { reportsApi } from './reports';
import { reportFixture } from './reportTestData';
import { saveDownload } from './exports';
vi.mock('./exports', () => ({ saveDownload: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(reportsApi, 'read').mockResolvedValue(reportFixture());
});
function show(props: Parameters<typeof ReportsWorkspace>[0] = {}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReportsWorkspace {...props} />
    </QueryClientProvider>,
  );
}
it('shows the marked exam columns and exports the selected filters and tab', async () => {
  vi.spyOn(reportsApi, 'document').mockResolvedValue({
    blob: new Blob(['exam']),
    filename: 'exam.html',
  });
  show();
  await screen.findByRole('table', { name: 'Course Progress' });
  fireEvent.click(screen.getByRole('tab', { name: 'Exam Readiness' }));
  const table = await screen.findByRole('table', { name: 'Exam Readiness' });
  expect(reportsApi.read).toHaveBeenCalledTimes(1);
  for (const name of [
    'Subject',
    'Batch',
    'Faculty',
    'Readiness Status',
    'Coverage',
    'Syllabus Left',
    'Teaching Left',
    'Time Cushion',
    'Scope Mode',
  ])
    expect(
      within(table).getByRole('columnheader', { name }),
    ).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Subject' }), {
    target: { value: 'subject-a' },
  });
  await waitFor(() =>
    expect(reportsApi.read).toHaveBeenLastCalledWith(
      expect.objectContaining({ subjectId: 'subject-a' }),
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Generate analysis report' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate analysis report' }),
  );
  await waitFor(() =>
    expect(reportsApi.document).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'subject-a', tab: 'exams' }),
    ),
  );
  expect(saveDownload).toHaveBeenCalled();
});
it('does not show scheduled classes as taught and can select all logged statuses', async () => {
  show();
  await screen.findByRole('table', { name: 'Course Progress' });
  fireEvent.click(screen.getByRole('tab', { name: 'Teaching Delivery' }));
  expect(await screen.findByText('No matching records')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Delivery status' }), {
    target: { value: 'ALL' },
  });
  await waitFor(() =>
    expect(reportsApi.read).toHaveBeenLastCalledWith(
      expect.objectContaining({ deliveryStatus: 'ALL' }),
    ),
  );
});
it('shows faculty only subject and teaching reports and prevents reversed date queries and exports', async () => {
  vi.mocked(reportsApi.read).mockResolvedValue({
    ...reportFixture(),
    facultyOnly: true,
    activeCampusId: 'campus-a',
  });
  show();
  await screen.findByRole('tab', { name: 'My Teaching' });
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
    'My Subjects',
    'My Teaching',
  ]);
  expect(
    screen.queryByRole('tab', { name: 'Campus & Track' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'Campus' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Your campus')).toBeInTheDocument();
  expect(screen.queryByText('Computer Science')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'Faculty' }),
  ).not.toBeInTheDocument();
  expect(
    screen
      .getAllByRole('option')
      .some((o) => o.textContent?.includes('Other campus')),
  ).toBe(false);
  fireEvent.click(screen.getByRole('tab', { name: 'My Teaching' }));
  await screen.findByText('No matching records');
  fireEvent.change(screen.getByLabelText('From date'), {
    target: { value: '2026-11-01' },
  });
  fireEvent.change(screen.getByLabelText('To date'), {
    target: { value: '2026-10-01' },
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'From date must be on or before To date',
  );
  expect(
    screen.getByRole('button', { name: 'Generate analysis report' }),
  ).toBeDisabled();
  expect(
    vi
      .mocked(reportsApi.read)
      .mock.calls.every(([f]) => !(f.from && f.to && f.from > f.to)),
  ).toBe(true);
});

it('exports faculty reports only for their current authorized campus, including after reset', async () => {
  vi.mocked(reportsApi.read).mockResolvedValue({
    ...reportFixture(),
    facultyOnly: true,
    activeCampusId: 'campus-a',
  });
  vi.spyOn(reportsApi, 'document').mockResolvedValue({
    blob: new Blob(['own']),
    filename: 'own.csv',
  });
  show();
  await screen.findByRole('tab', { name: 'My Teaching' });
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Generate analysis report' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate analysis report' }),
  );
  await waitFor(() =>
    expect(reportsApi.document).toHaveBeenCalledWith(
      expect.objectContaining({
        campusId: 'campus-a',
        tab: 'course',
        facultyId: undefined,
      }),
    ),
  );
});
it('never shows management report tabs while a faculty session is loading or opens a retired tab', async () => {
  vi.mocked(reportsApi.read).mockReturnValue(new Promise(() => {}));
  show({ facultyOnly: true, initialTab: 'exams' });
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
    'My Subjects',
    'My Teaching',
  ]);
  expect(screen.getByRole('tab', { name: 'My Subjects' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    screen.queryByRole('tab', { name: 'Exam Readiness' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('tab', { name: 'Faculty Activity' }),
  ).not.toBeInTheDocument();
});
