import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { academicApi } from './academic';
import { SemesterSubjects } from './SemesterSubjects';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('links the selected campus subject to an existing semester batch without creating another batch', async () => {
  vi.spyOn(academicApi, 'semesterCourses').mockResolvedValue([
    {
      id: 'batch',
      name: 'Batch A',
      code: 'A',
      track: { name: 'Track' },
      subjectOfferings: [],
    },
  ]);
  vi.spyOn(academicApi, 'subjects').mockResolvedValue([
    {
      id: 'subject',
      name: 'Web Development',
      code: 'WD',
      active: true,
      description: null,
    },
  ]);
  const save = vi
    .spyOn(academicApi, 'connectSubjects')
    .mockResolvedValue({ batchId: 'batch', subjectsLinked: 1 });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SemesterSubjects semesterId="semester" campusId="campus" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByLabelText('Web Development'));
  fireEvent.change(screen.getByLabelText('Batch'), {
    target: { value: 'batch' },
  });
  fireEvent.change(screen.getByLabelText('Subject track'), { target: { value: 'MIRAI' } });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save batch and subjects' }),
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith('semester', {
      batchId: 'batch',
      trackCode: 'MIRAI',
      trackName: 'Mirai',
      subjectIds: ['subject'],
    }),
  );
  expect(screen.queryByLabelText('Batch name')).not.toBeInTheDocument();
});
