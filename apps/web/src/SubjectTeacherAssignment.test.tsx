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
import { SubjectTeacherAssignment } from './SubjectTeacherAssignment';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows the teacher and allows assignment after subject creation', async () => {
  vi.spyOn(academicApi, 'subjectFaculty').mockResolvedValue([
    { id: 'teacher', user: { name: 'Asha' } },
  ]);
  const save = vi
    .spyOn(academicApi, 'assignSubjectTeacher')
    .mockResolvedValue({ assigned: true });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SubjectTeacherAssignment
        campusId="campus"
        subject={{
          id: 'subject',
          name: 'Math',
          code: 'M',
          active: true,
          description: null,
          offerings: [
            {
              id: 'offering',
              batch: { name: 'First Year A', semester: { name: 'Semester 1' } },
              faculty: [],
            },
          ],
        }}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Not assigned/)).toBeTruthy();
  fireEvent.click(screen.getByText('Assign teacher'));
  await screen.findByText('Asha');
  fireEvent.change(screen.getByLabelText('Teacher'), {
    target: { value: 'teacher' },
  });
  fireEvent.click(screen.getByText('Save teacher'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith('subject', {
      campusId: 'campus',
      staffProfileId: 'teacher',
      offeringId: 'offering',
    }),
  );
  await screen.findByText('Teacher assignment saved.');
});

it('explains an unlinked subject instead of allowing a disconnected assignment', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SubjectTeacherAssignment
        campusId="campus"
        subject={{
          id: 's',
          name: 'DSA',
          code: 'DSA',
          active: true,
          description: null,
          offerings: [],
        }}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Pending semester link/)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Assign teacher' }),
  ).not.toBeInTheDocument();
});
