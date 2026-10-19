import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BatchTimetableImport } from './BatchTimetableImport';
import { OfferingListItem, timetableApi } from './timetable';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const offerings = [
  { id: 'o1', batch: { id: 'b1', code: 'A', name: 'First year' } },
] as OfferingListItem[];
const result = {
  batch: { id: 'b1', name: 'First year' },
  valid: true,
  rows: [
    {
      subject: 'DSA',
      source: 'row 2',
      facultyAssignmentId: 'assignment-a',
      teacher: 'Asha',
      weekday: 1,
      startTime: '09:00',
      endTime: '10:00',
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-12-31',
      existing: false,
    },
  ],
  errors: [],
  added: 0,
};
it('previews the selected batch before confirming and clears stale previews on file change', async () => {
  const api = vi.spyOn(timetableApi, 'importBatch').mockResolvedValue(result);
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(<BatchTimetableImport offerings={offerings} onChanged={onChanged} />);
  const file = new File(['Subject,Teacher,Day'], 'batch.csv');
  fireEvent.change(screen.getByLabelText('Weekly timetable file'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByText('Preview timetable'));
  await screen.findByText('DSA');
  expect(api).toHaveBeenCalledWith('b1', file, false);
  expect(onChanged).not.toHaveBeenCalled();
  api.mockResolvedValue({ ...result, added: 1 });
  fireEvent.click(screen.getByText('Confirm batch timetable'));
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  expect(api).toHaveBeenLastCalledWith('b1', file, true);
  fireEvent.change(screen.getByLabelText('Weekly timetable file'), {
    target: { files: [new File([''], 'changed.csv')] },
  });
  expect(screen.queryByText('DSA')).not.toBeInTheDocument();
});
it('prevents confirmation when the server reports unmatched subjects or conflicts', async () => {
  vi.spyOn(timetableApi, 'importBatch').mockResolvedValue({
    ...result,
    valid: false,
    errors: [{ source: 'row 2', message: 'Overlapping class' }],
  });
  render(<BatchTimetableImport offerings={offerings} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Weekly timetable file'), {
    target: { files: [new File([''], 'batch.csv')] },
  });
  fireEvent.click(screen.getByText('Preview timetable'));
  await screen.findByText('row 2: Overlapping class');
  expect(screen.getByText('Confirm batch timetable')).toBeDisabled();
});
