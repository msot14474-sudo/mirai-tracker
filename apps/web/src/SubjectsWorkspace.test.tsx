import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { academicApi, Semester, Subject } from './academic';
import { SubjectsWorkspace } from './SubjectsWorkspace';
import { CampusDataScope } from './CampusDataScope';
import { reportsApi } from './reports';
import { reportFixture } from './reportTestData';
import { lessonPlanApi } from './lessonPlans';
import { timetableApi } from './timetable';

const semester: Semester = {
  id: 'semester-a',
  campusId: 'campus-a',
  name: 'Semester 1',
  startDate: '2026-07-20',
  endDate: '2026-12-18',
  status: 'ACTIVE',
  workingSaturdayRule: 'SECOND_AND_FOURTH',
};
const subject: Subject = {
  id: 'subject-a',
  name: 'Web Development',
  code: 'WEB',
  active: true,
  description: null,
  offerings: [
    {
      id: 'offering-a',
      academicTrack: 'MIRAI',
      batch: { id: 'batch-a', name: 'First Year A', semester },
      faculty: [
        { staffProfile: { id: 'teacher-a', user: { name: 'Teacher One' } } },
      ],
    },
  ],
};
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  vi.spyOn(academicApi, 'campuses').mockResolvedValue([
    { id: 'campus-a', name: 'HI-Tech', code: 'HT', timezone: 'Asia/Kolkata' },
    { id: 'campus-b', name: 'Rathinam', code: 'R', timezone: 'Asia/Kolkata' },
  ]);
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      ...semester,
      id: 'draft',
      name: 'Old draft',
      startDate: '2026-08-01',
      status: 'DRAFT',
    },
    semester,
  ]);
  vi.spyOn(academicApi, 'subjects').mockResolvedValue([subject]);
  vi.spyOn(reportsApi, 'summary').mockResolvedValue(reportFixture());
  vi.spyOn(reportsApi, 'read').mockResolvedValue(reportFixture());
  vi.spyOn(lessonPlanApi, 'offering').mockReturnValue(new Promise(() => {}));
  vi.spyOn(timetableApi, 'offering').mockResolvedValue({
    semester: { campus: { timezone: 'Asia/Kolkata' } },
    sessions: [],
    summary: { weeklyPlannedMinutes: 180 },
  } as any);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
function show() {
  return render(
    <QueryClientProvider client={client}>
      <SubjectsWorkspace />
    </QueryClientProvider>,
  );
}
it('opens saved subject links across semesters without waiting for analytics, then loads only the selected detail tab', async () => {
  vi.mocked(reportsApi.summary).mockReturnValue(new Promise(() => {}));
  show();
  const open = await screen.findByRole('button', {
    name: 'Open Web Development · First Year A · Semester 1',
  });
  expect(screen.getByLabelText('Semester')).toHaveValue('');
  expect(
    screen.queryByText(/Not linked|No batch has been assigned/),
  ).not.toBeInTheDocument();
  fireEvent.click(open);
  expect(
    await screen.findByRole('heading', { name: 'Web Development' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Teacher One')).toBeInTheDocument();
  expect(reportsApi.read).not.toHaveBeenCalled();
  expect(lessonPlanApi.offering).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('tab', { name: 'Teaching plan & syllabus' }),
  );
  await waitFor(() =>
    expect(lessonPlanApi.offering).toHaveBeenCalledWith('offering-a'),
  );
  expect(
    screen.queryByText('No lesson plan uploaded.'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Lectures' }));
  await waitFor(() =>
    expect(reportsApi.read).toHaveBeenCalledWith({
      campusId: 'campus-a',
      offeringId: 'offering-a',
      deliveryStatus: 'ALL',
    }),
  );
});
it('keeps subject navigation usable when analytics fails and never labels filtered-out links as missing', async () => {
  vi.mocked(reportsApi.summary).mockRejectedValue(
    new Error('Temporary outage'),
  );
  show();
  await screen.findByRole('button', { name: /Open Web Development/ });
  await screen.findByText(/Progress could not be refreshed/);
  fireEvent.change(screen.getByLabelText('Semester'), {
    target: { value: 'draft' },
  });
  expect(await screen.findByText(/No subjects match/)).toBeInTheDocument();
  expect(
    screen.queryByText(/Not linked|No batch has been assigned/),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Semester'), {
    target: { value: '' },
  });
  expect(
    await screen.findByRole('button', { name: /Open Web Development/ }),
  ).toBeInTheDocument();
});
it('clears the prior subject detail when moving to another campus', async () => {
  vi.mocked(academicApi.subjects).mockImplementation(async (id) =>
    id === 'campus-a' ? [subject] : [],
  );
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: /Open Web Development/ }),
  );
  await screen.findByRole('heading', { name: 'Web Development' });
  fireEvent.change(screen.getByLabelText('Campus'), {
    target: { value: 'campus-b' },
  });
  await waitFor(() =>
    expect(academicApi.subjects).toHaveBeenLastCalledWith('campus-b'),
  );
  expect(
    screen.queryByRole('heading', { name: 'Web Development' }),
  ).not.toBeInTheDocument();
});
it('prefers the active semester for workspaces that require one semester', async () => {
  render(
    <QueryClientProvider client={client}>
      <CampusDataScope title="Test" description="Scope">
        {(s) => <p>Selected {s.name}</p>}
      </CampusDataScope>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Selected Semester 1')).toBeInTheDocument();
  expect(screen.getByLabelText('Semester')).toHaveValue('semester-a');
});
