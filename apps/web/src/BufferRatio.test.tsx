import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BufferRatio } from './BufferRatio';
afterEach(cleanup);
describe('Buffer ratio presentation', () => {
  it('distinguishes missing data, completion and zero teaching capacity', () => {
    const view = render(<BufferRatio />);
    expect(screen.getByText('Needs data')).toBeInTheDocument();
    view.rerender(<BufferRatio metrics={{ remainingHours: 0, availableHours: 3, bufferRatio: null, status: 'COMPLETE' }} />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument();
    view.rerender(<BufferRatio metrics={{ remainingHours: 5, availableHours: 0, bufferRatio: 0, status: 'DANGER' }} />);
    expect(screen.getByText('0.00×')).toBeInTheDocument();
    expect(screen.getByText('DANGER')).toBeInTheDocument();
  });
  it('shows the effective subject thresholds, not the default rule', () => {
    render(<BufferRatio metrics={{ remainingHours: 10, availableHours: 12, bufferRatio: 1.2, status: 'TIGHT', thresholds: { onTrack: 1.25, tight: 1.1 } }} />);
    expect(screen.getByText('1.20×')).toBeInTheDocument();
    expect(screen.getByText('TIGHT')).toBeInTheDocument();
    expect(screen.getByText(/≥ 1.25 ON TRACK · 1.10–<1.25 TIGHT · < 1.10 DANGER/)).toBeInTheDocument();
  });
});
