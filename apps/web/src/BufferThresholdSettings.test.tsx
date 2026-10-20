import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BufferThresholdSettings } from './BufferThresholdSettings';
import { academicApi, Semester } from './academic';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const semester = { id: 'semester-a', defaultOnTrackThreshold: '1.150', defaultTightThreshold: '1.000' } as Semester;
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BufferThresholdSettings semester={semester} /></QueryClientProvider>);
  fireEvent.click(screen.getByText('Buffer ratio thresholds'));
}
it('saves the numeric semester thresholds and refreshes analytics', async () => {
  const save = vi.spyOn(academicApi, 'updateBufferThresholds').mockResolvedValue(semester);
  setup();
  fireEvent.change(screen.getByLabelText('On track minimum'), { target: { value: '1.25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save buffer thresholds' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith('semester-a', { defaultOnTrackThreshold: 1.25, defaultTightThreshold: 1 }));
  expect(await screen.findByRole('status')).toHaveTextContent('Buffer thresholds saved');
});
it('blocks reversed or empty thresholds instead of submitting them', () => {
  const save = vi.spyOn(academicApi, 'updateBufferThresholds');
  setup();
  fireEvent.change(screen.getByLabelText('Tight minimum'), { target: { value: '2' } });
  expect(screen.getByRole('button', { name: 'Save buffer thresholds' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Tight minimum'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Save buffer thresholds' })).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
});
