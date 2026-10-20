import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AcademicOverview } from './AcademicOverview';
import { reportsApi } from './reports';
import { reportFixture } from './reportTestData';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function show(props: Partial<Parameters<typeof AcademicOverview>[0]> = {}) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AcademicOverview name="Test User" {...props} />
    </QueryClientProvider>,
  );
}
it('keeps manager overview read-only and drills into a subject report', async () => {
  vi.spyOn(reportsApi, 'read').mockResolvedValue(reportFixture());
  const open = vi.fn();
  show({ onReports: open, onLog: vi.fn(), onLessonPlan: vi.fn() });
  await screen.findByRole('heading', { name: 'Web Development' });
  expect(
    screen.queryByRole('button', { name: 'Log a class' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open lesson plans' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/do not confirm that a class was missed/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Subject report/ }));
  expect(open).toHaveBeenCalledWith('subject-a');
});
it('shows faculty teaching controls and unknown coverage instead of inventing progress', async () => {
  const data = reportFixture();
  data.subjects[0] = {
    ...data.subjects[0]!,
    metrics: null,
    status: 'NEEDS_DATA',
    reason: 'Add lesson-plan hours.',
  };
  data.summary = {
    ...data.summary,
    metrics: null,
    status: 'NEEDS_DATA',
    needsData: 1,
    atRisk: 0,
  };
  vi.spyOn(reportsApi, 'read').mockResolvedValue(data);
  const plans = vi.fn();
  show({ faculty: true, onLog: vi.fn(), onLessonPlan: plans });
  await screen.findByText(/Coverage unknown until/);
  expect(
    screen.getByRole('button', { name: 'Log a class' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open lesson plans' }));
  expect(plans).toHaveBeenCalledWith('offering-a');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
