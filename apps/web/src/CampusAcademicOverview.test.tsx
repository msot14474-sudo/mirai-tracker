import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { academicApi } from './academic';
import { CampusAcademicOverview } from './CampusAcademicOverview';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows admin-created subjects even without offerings and permits campus subject and calendar management', async () => {
  vi.spyOn(academicApi, 'campuses').mockResolvedValue([
    { id: 'campus', name: 'HI-Tech', code: 'HT', timezone: 'Asia/Kolkata' },
  ]);
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      id: 'semester',
      campusId: 'campus',
      name: 'Semester 1',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      status: 'ACTIVE',
    },
  ]);
  vi.spyOn(academicApi, 'subjects').mockResolvedValue([
    {
      id: 'subject',
      name: 'Web Development',
      code: 'WD',
      description: null,
      active: true,
      offerings: [],
    },
  ]);
  vi.spyOn(academicApi, 'semesterCourses').mockResolvedValue([]);
  vi.spyOn(academicApi, 'calendar').mockResolvedValue({
    semester: {
      id: 'semester',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    } as any,
    days: [],
    exams: [],
    summary: { totalDays: 0, workingDays: 0, nonWorkingDays: 0 },
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CampusAcademicOverview />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole('heading', { name: 'Web Development' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole('option', { name: /Semester 1/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Link this subject to a semester/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Add subject' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Update calendar date' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /delete/i }),
  ).not.toBeInTheDocument();
  expect(academicApi.subjects).toHaveBeenCalledWith('campus');
});
it('shows the selected semester teacher without contradictory default-teacher text', async () => {
  vi.spyOn(academicApi, 'campuses').mockResolvedValue([
    { id: 'c', name: 'HI-Tech', code: 'HT', timezone: 'Asia/Kolkata' },
  ]);
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([
    {
      id: 'sem',
      campusId: 'c',
      name: 'Semester 1',
      startDate: '2030-01-01',
      endDate: '2030-06-30',
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      status: 'ACTIVE',
    },
  ]);
  vi.spyOn(academicApi, 'subjects').mockResolvedValue([
    {
      id: 's',
      name: 'Web Development',
      code: 'WD',
      description: null,
      active: true,
      teachers: [],
      offerings: [
        {
          id: 'current',
          batch: {
            name: 'First Year A',
            semester: { id: 'sem', name: 'Semester 1' },
          },
          faculty: [{ staffProfile: { user: { name: 'Assigned Teacher' } } }],
        },
        {
          id: 'other',
          batch: {
            name: 'Another semester batch',
            semester: { id: 'other-sem', name: 'Other semester' },
          },
          faculty: [{ staffProfile: { user: { name: 'Other Teacher' } } }],
        },
      ],
    },
  ] as any);
  vi.spyOn(academicApi, 'semesterCourses').mockResolvedValue([
    { id: 'b', name: 'First Year A', subjectOfferings: [{ id: 'current' }] },
  ] as any);
  vi.spyOn(academicApi, 'calendar').mockResolvedValue({
    semester: {
      id: 'semester',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    } as any,
    days: [],
    exams: [],
    summary: { totalDays: 0, workingDays: 0, nonWorkingDays: 0 },
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CampusAcademicOverview />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Assigned Teacher')).toBeInTheDocument();
  expect(screen.queryByText(/Teacher not assigned/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Other Teacher')).not.toBeInTheDocument();
});
