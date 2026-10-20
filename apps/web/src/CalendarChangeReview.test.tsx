import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { CalendarChangeReview } from './CalendarChangeReview';
import { topicScheduleApi, TopicScheduleDetail } from './topicSchedules';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const sessions = [
  {
    id: 'cancelled',
    sessionDate: '2030-01-04',
    plannedMinutes: 60,
    status: 'CANCELLED',
    needsCalendarReview: true,
    hasLogs: false,
  },
] as TopicScheduleDetail['sessions'];
function setup() {
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CalendarChangeReview sessions={sessions} onChanged={refresh} />
    </QueryClientProvider>,
  );
  return refresh;
}
it('shows recommendations without moving anything until the teacher confirms', async () => {
  vi.spyOn(topicScheduleApi, 'recoveryOptions').mockResolvedValue({
    options: [
      {
        id: 'next',
        date: '2030-01-08',
        startTime: '09:00',
        endTime: '10:00',
        afterTarget: false,
      },
    ],
    recommendedId: 'next',
    source: 'ai',
    explanation: 'Keeps topic order before the exam.',
    timezone: 'Asia/Kolkata',
  });
  const move = vi.spyOn(topicScheduleApi, 'move').mockResolvedValue({});
  const refresh = setup();
  fireEvent.click(
    screen.getByRole('button', { name: 'Suggest a replacement' }),
  );
  expect(await screen.findByText('AI recommendation')).toBeInTheDocument();
  expect(move).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm and move class' }),
  );
  await waitFor(() =>
    expect(move).toHaveBeenCalledWith(
      'cancelled',
      expect.objectContaining({
        date: '2030-01-08',
        startTime: '09:00',
        endTime: '10:00',
      }),
    ),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});
it('lets a teacher use remaining classes without creating an extra session', async () => {
  const keep = vi
    .spyOn(topicScheduleApi, 'setCancellation')
    .mockResolvedValue({});
  const move = vi.spyOn(topicScheduleApi, 'move').mockResolvedValue({});
  setup();
  fireEvent.click(
    screen.getByRole('button', { name: 'Use remaining classes' }),
  );
  await waitFor(() =>
    expect(keep).toHaveBeenCalledWith(
      'cancelled',
      true,
      expect.stringContaining('Teacher reviewed'),
    ),
  );
  expect(move).not.toHaveBeenCalled();
});
it('shows a changed-calendar conflict without claiming the move succeeded', async () => {
  vi.spyOn(topicScheduleApi, 'move').mockRejectedValue(
    new Error('This date is now closed.'),
  );
  const refresh = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Choose a time' }));
  fireEvent.change(screen.getByLabelText('Date'), {
    target: { value: '2030-01-08' },
  });
  fireEvent.change(screen.getByLabelText('Starts (campus time)'), {
    target: { value: '09:00' },
  });
  fireEvent.change(screen.getByLabelText('Ends (campus time)'), {
    target: { value: '10:00' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm and move class' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This date is now closed.',
  );
  expect(refresh).not.toHaveBeenCalled();
});
