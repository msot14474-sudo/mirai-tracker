import { describe, expect, it, vi } from 'vitest';
import { alertJobSchedules, describeJob, processMiraiJob } from './jobs.js';

describe('describeJob', () => {
  it('documents the required 48-hour escalation job', () => {
    expect(describeJob('campus-manager-escalation')).toContain('48 hours');
  });

  it('documents the tracked M05 semester import job', () => {
    expect(describeJob('semester-import')).toContain(
      'validated semester import',
    );
  });

  it('documents the M06 scheduled-session generation job', () => {
    expect(describeJob('generate-scheduled-sessions')).toContain(
      'weekly timetable',
    );
  });

  it('documents the M08 planned-date recalculation job', () => {
    expect(describeJob('recalculate-planned-dates')).toContain(
      'Shift affected topic dates',
    );
  });

  it('registers separate five-minute scans for both M14 alert stages', () => {
    expect(alertJobSchedules).toEqual([
      expect.objectContaining({
        name: 'missed-session-reminder',
        every: 300_000,
      }),
      expect.objectContaining({
        name: 'campus-manager-escalation',
        every: 300_000,
      }),
    ]);
    expect(new Set(alertJobSchedules.map((schedule) => schedule.id)).size).toBe(
      2,
    );
  });

  it('calls the protected API with the correct escalation stage', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sent: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      processMiraiJob('campus-manager-escalation', {
        apiUrl: 'http://api:3000/',
        internalSecret: 'worker-secret',
        fetcher,
      }),
    ).resolves.toEqual({ sent: 1 });
    expect(fetcher).toHaveBeenCalledWith(
      'http://api:3000/missed-log-alerts/process-due',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-internal-job-secret': 'worker-secret',
        }),
        body: JSON.stringify({ stage: 'CAMPUS_MANAGER_ESCALATION' }),
      }),
    );
  });
});
