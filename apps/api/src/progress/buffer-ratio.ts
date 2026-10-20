const thresholdNumber = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
type BufferMetrics = {
  availableHours: number;
  remainingHours: number;
  bufferRatio: number | null;
  status: string;
  thresholds: { onTrack: number; tight: number };
};
export function bufferRatioText(metrics: BufferMetrics | null | undefined) {
  if (!metrics || metrics.status === 'NEEDS_DATA') return 'Buffer ratio: Needs data. A lesson plan and timetable are required.';
  const { onTrack, tight } = metrics.thresholds;
  return `Buffer ratio: ${metrics.status === 'COMPLETE' ? 'Complete (no remaining syllabus)' : metrics.bufferRatio == null ? 'Needs data' : `${metrics.bufferRatio.toFixed(2)}×`} · ${metrics.status.replaceAll('_', ' ')}. ${metrics.availableHours} available hours ÷ ${metrics.remainingHours} remaining hours. Thresholds: ≥ ${thresholdNumber(onTrack)} ON TRACK; ${thresholdNumber(tight)}–<${thresholdNumber(onTrack)} TIGHT; < ${thresholdNumber(tight)} DANGER. Status uses unrounded values.`;
}
