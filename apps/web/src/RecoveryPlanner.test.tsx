import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubjectProgress } from './progress';
import { RecoveryPlanner } from './RecoveryPlanner';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('M20 what-if recovery planner', () => {
  it('explains the safe scenario and calculates a subject intervention', () => {
    render(<RecoveryPlanner subjects={[dangerSubject]} />);

    expect(
      screen.getByRole('heading', { name: 'What-if recovery planner' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No timetable.*is changed/i)).toBeInTheDocument();
    expect(screen.getByText('7h')).toBeInTheDocument();
    expect(screen.getByText('7h more capacity needed.')).toBeInTheDocument();
  });

  it('applies the minimum plan and reports the projected result', () => {
    render(<RecoveryPlanner subjects={[dangerSubject]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply minimum plan' }));

    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7')).toBeInTheDocument();
    expect(
      screen.getByText('Selected on-track target is met.'),
    ).toBeInTheDocument();
  });

  it('recalculates for a tight-or-better target', () => {
    render(<RecoveryPlanner subjects={[dangerSubject]} />);

    fireEvent.change(screen.getByLabelText('Recovery target'), {
      target: { value: 'TIGHT' },
    });

    expect(screen.getByText('4h')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use minimum' }));
    expect(
      screen.getByText('Selected tight-or-better target is met.'),
    ).toBeInTheDocument();
  });
});

const dangerSubject: SubjectProgress = {
  id: 'offering-danger',
  targetFinishDate: '2026-11-30',
  subject: { id: 'subject-a', code: 'MIR-201', name: 'Applied Physics' },
  batch: { id: 'batch-a', code: 'A', name: 'Mirai Sample Batch A' },
  track: { id: 'track-a', code: 'MIRAI', name: 'Mirai Track' },
  campus: { id: 'campus-a', code: 'MAIN', name: 'Hi-Tech Campus' },
  semester: { id: 'semester-a', name: 'Semester 2026' },
  lessonPlan: { id: 'plan-a', version: 1, status: 'ACTIVE' },
  scheduleVersion: 4,
  thresholds: { onTrack: 1.15, tight: 1 },
  hoursInScope: 30,
  coveredHours: 10,
  coveragePercentage: 33.33,
  remainingHours: 20,
  availableHours: 16,
  plannedHoursByToday: 12,
  paceVsPlanHours: -2,
  bufferRatio: 0.8,
  status: 'DANGER',
  overdueTopics: [],
};
