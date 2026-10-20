import { useQuery } from '@tanstack/react-query';
import { progressApi } from './progress';
import './buffer-ratio.css';

export type BufferMetrics = {
  bufferRatio: number | null;
  availableHours: number;
  remainingHours: number;
  status: string;
  thresholds?: { onTrack: number; tight: number };
};
const thresholdNumber = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const number = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
export function bufferValue(metrics?: BufferMetrics | null) {
  if (!metrics || metrics.status === 'NEEDS_DATA') return 'Needs data';
  if (metrics.status === 'COMPLETE') return 'Complete';
  return metrics.bufferRatio == null ? 'Needs data' : `${metrics.bufferRatio.toFixed(2)}×`;
}
export function bufferRule(thresholds = { onTrack: 1.15, tight: 1 }) {
  return `≥ ${thresholdNumber(thresholds.onTrack)} ON TRACK · ${thresholdNumber(thresholds.tight)}–<${thresholdNumber(thresholds.onTrack)} TIGHT · < ${thresholdNumber(thresholds.tight)} DANGER`;
}
export function BufferRatioValue({ metrics }: { metrics?: BufferMetrics | null }) {
  return <span title={metrics
    ? `${number(metrics.availableHours)} available hours ÷ ${number(metrics.remainingHours)} remaining hours. ${bufferRule(metrics.thresholds)}. Status uses unrounded values.`
    : 'Add a lesson plan and timetable to assess the buffer ratio.'}>{bufferValue(metrics)}</span>;
}
export function BufferRatioLegend({ thresholds }: { thresholds?: BufferMetrics['thresholds'] }) {
  return <div className="buffer-ratio-legend">
    <p><strong>Buffer ratio</strong> = available hours ÷ remaining hours.</p>
    <p>{thresholds ? 'Current thresholds: ' : 'Default thresholds: '}{bufferRule(thresholds)}</p>
    <small>Available hours are usable classes after the reporting date, through the syllabus deadline. Thresholds are configurable in Semester setup; subject overrides take precedence. No remaining syllabus means Complete. Missing data is not zero. Status uses unrounded values.</small>
  </div>;
}
export function BufferRatio({ metrics }: { metrics?: BufferMetrics | null }) {
  return <section className="buffer-ratio" aria-label="Subject buffer ratio">
    <div className="buffer-ratio-heading">
      <span>Buffer ratio</span>
      <strong><BufferRatioValue metrics={metrics} /></strong>
      {metrics && <span className={`buffer-status buffer-${metrics.status.toLowerCase()}`}>{metrics.status.replaceAll('_', ' ')}</span>}
    </div>
    <p>{metrics
      ? `${number(metrics.availableHours)} h available ÷ ${number(metrics.remainingHours)} h remaining`
      : 'A lesson plan and timetable are needed to assess teaching capacity.'}</p>
    <details><summary>Formula and thresholds</summary><BufferRatioLegend thresholds={metrics?.thresholds} /></details>
  </section>;
}
/** Uses the same authorized calculation as Progress; shares its invalidation prefix. */
export function SubjectBufferRatio({ offeringId, enabled = true }: { offeringId: string; enabled?: boolean }) {
  const now = new Date();
  const asOf = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const query = useQuery({
    queryKey: ['progress-dashboard', 'subject', offeringId, asOf],
    queryFn: () => progressApi.subject(offeringId, asOf),
    enabled,
    refetchInterval: 30000,
  });
  if (enabled && query.isPending) return <p className="buffer-ratio-loading" role="status">Calculating buffer ratio…</p>;
  if (query.isError) return <div className="buffer-ratio" role="status">Buffer ratio unavailable. <button type="button" onClick={() => void query.refetch()}>Retry</button></div>;
  return <BufferRatio metrics={enabled ? query.data : null} />;
}
