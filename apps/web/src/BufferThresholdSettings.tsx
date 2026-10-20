import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { academicApi, Semester } from './academic';
import { BufferRatioLegend } from './BufferRatio';

export function BufferThresholdSettings({ semester }: { semester: Semester }) {
  const [onTrack, setOnTrack] = useState(String(semester.defaultOnTrackThreshold ?? 1.15));
  const [tight, setTight] = useState(String(semester.defaultTightThreshold ?? 1));
  const queryClient = useQueryClient();
  const valid = Number.isFinite(Number(onTrack)) && Number.isFinite(Number(tight)) &&
    Number(tight) > 0 && Number(onTrack) >= Number(tight) && Number(onTrack) <= 10;
  const save = useMutation({
    mutationFn: () => academicApi.updateBufferThresholds(semester.id, {
      defaultOnTrackThreshold: Number(onTrack), defaultTightThreshold: Number(tight),
    }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  function submit(e: FormEvent) { e.preventDefault(); if (valid) save.mutate(); }
  return <details className="buffer-ratio">
    <summary>Buffer ratio thresholds</summary>
    <BufferRatioLegend thresholds={{
      onTrack: Number(semester.defaultOnTrackThreshold ?? 1.15),
      tight: Number(semester.defaultTightThreshold ?? 1),
    }} />
    <form onSubmit={submit} className="buffer-threshold-form">
      <div className="buffer-threshold-fields">
        <label>On track minimum<input type="number" min="0.001" max="10" step="0.001" required value={onTrack} onChange={e => { setOnTrack(e.target.value); save.reset(); }} /></label>
        <label>Tight minimum<input type="number" min="0.001" max="10" step="0.001" required value={tight} onChange={e => { setTight(e.target.value); save.reset(); }} /></label>
      </div>
      <small>Applies to this semester. Existing subject-specific thresholds remain in effect.</small>
      {!valid && <p className="form-error">Use positive thresholds up to 10. On track must be at least the tight minimum.</p>}
      {save.error && <p role="alert" className="form-error">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Buffer thresholds saved. Analytics now use the updated values.</p>}
      <button type="submit" disabled={!valid || save.isPending}>{save.isPending ? 'Saving…' : 'Save buffer thresholds'}</button>
    </form>
  </details>;
}
