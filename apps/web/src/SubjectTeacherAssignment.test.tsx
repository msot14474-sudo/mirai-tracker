import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { academicApi, Subject } from './academic';
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

it('updates the saved teacher in the catalog without waiting for another read', async () => {
  const subject: Subject = {
    id: 's',
    name: 'Math',
    code: 'M',
    active: true,
    description: null,
    offerings: [
      {
        id: 'o',
        batch: { name: 'A', semester: { name: 'Term' } },
        faculty: [],
      },
    ],
  };
  const saved = {
    ...subject,
    offerings: [
      {
        ...subject.offerings![0]!,
        faculty: [{ staffProfile: { id: 't', user: { name: 'Asha' } } }],
      },
    ],
  };
  vi.spyOn(academicApi, 'subjectFaculty').mockResolvedValue([
    { id: 't', user: { name: 'Asha' } },
  ]);
  vi.spyOn(academicApi, 'assignSubjectTeacher').mockResolvedValue({
    assigned: true,
    subject: saved,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['academic', 'subjects', 'campus'], [subject]);
  render(
    <QueryClientProvider client={client}>
      <SubjectTeacherAssignment campusId="campus" subject={subject} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Assign teacher' }));
  await screen.findByText('Asha');
  fireEvent.change(screen.getByLabelText('Teacher'), {
    target: { value: 't' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save teacher' }));
  await screen.findByText('Teacher assignment saved.');
  expect(client.getQueryData(['academic', 'subjects', 'campus'])).toEqual([
    saved,
  ]);
});

it('shows linked teachers without assignment controls for read-only users', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SubjectTeacherAssignment
        readOnly
        campusId="campus"
        subject={{
          id: 's',
          name: 'DSA',
          code: 'DSA',
          description: null,
          active: true,
          offerings: [
            {
              id: 'o',
              batch: { name: 'Section A', semester: { name: 'Sem 1' } },
              faculty: [{ staffProfile: { id: 't', user: { name: 'Asha' } } }],
            },
          ],
        }}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Sem 1')).toBeInTheDocument();
  expect(screen.getByText('Section A')).toBeInTheDocument();
  expect(screen.getByText('Asha')).toBeInTheDocument();
  expect(screen.queryByText('Not assigned')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Assign teacher' }),
  ).not.toBeInTheDocument();
});
