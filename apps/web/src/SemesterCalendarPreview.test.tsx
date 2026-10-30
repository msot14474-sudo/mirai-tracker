import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SemesterCalendarPreview } from './SemesterCalendarPreview';
import { GeneratedCalendar } from './academic';

afterEach(cleanup);

it('lets a user reach every month without mixing dates or losing holiday names', () => {
  const calendar = {
    days: [
      {
        date: '2025-08-31',
        weekday: 'SUNDAY',
        working: false,
        reason: 'SUNDAY',
        override: null,
      },
      {
        date: '2025-09-01',
        weekday: 'MONDAY',
        working: true,
        reason: 'WEEKDAY',
        override: null,
      },
      {
        date: '2025-09-02',
        weekday: 'TUESDAY',
        working: false,
        reason: 'HOLIDAY',
        override: { title: 'Campus holiday' },
      },
      {
        date: '2025-10-01',
        weekday: 'WEDNESDAY',
        working: true,
        reason: 'WEEKDAY',
        override: null,
      },
    ],
  } as GeneratedCalendar;
  const { container } = render(<SemesterCalendarPreview calendar={calendar} />);
  expect(screen.getByLabelText('Calendar month')).toHaveValue('2025-08');
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByLabelText('Calendar month')).toHaveValue('2025-09');
  expect(container.querySelectorAll('time')).toHaveLength(2);
  expect(screen.getByText('Campus holiday')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    '1 teaching day · 1 non-teaching day',
  );
  fireEvent.change(screen.getByLabelText('Calendar month'), {
    target: { value: '2025-10' },
  });
  expect(container.querySelector('time')).toHaveAttribute(
    'datetime',
    '2025-10-01',
  );
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText('Campus holiday')).toBeInTheDocument();
});

it('handles an empty calendar without displaying invalid dates', () => {
  render(
    <SemesterCalendarPreview
      calendar={{ days: [] } as unknown as GeneratedCalendar}
    />,
  );
  expect(
    screen.getByText('No calendar dates are available.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
