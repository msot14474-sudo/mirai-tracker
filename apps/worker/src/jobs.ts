export type MiraiJobName =
  | 'weekly-academic-summary'
  | 'health-check'
  | 'missed-session-reminder'
  | 'campus-manager-escalation'
  | 'recalculate-planned-dates'
  | 'semester-import'
  | 'generate-scheduled-sessions';

export type AlertJobName =
  'missed-session-reminder' | 'campus-manager-escalation';

export const alertJobSchedules: Array<{
  id: string;
  name: AlertJobName;
  every: number;
}> = [
  {
    id: 'm14-faculty-reminder-scan',
    name: 'missed-session-reminder',
    every: 5 * 60 * 1_000,
  },
  {
    id: 'm14-manager-escalation-scan',
    name: 'campus-manager-escalation',
    every: 5 * 60 * 1_000,
  },
];

export async function processMiraiJob(
  name: MiraiJobName,
  options: {
    apiUrl: string;
    internalSecret: string | undefined;
    fetcher?: typeof fetch;
  },
) {
  if (name === 'weekly-academic-summary') {
    if (!options.internalSecret)
      throw new Error('INTERNAL_JOB_SECRET is required for weekly summaries.');
    const response = await (options.fetcher ?? fetch)(
      `${options.apiUrl.replace(/\/$/, '')}/notifications/weekly-summaries/process`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-job-secret': options.internalSecret,
        },
        body: JSON.stringify({ enqueue: true }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Weekly summary scan failed with HTTP ${response.status}.`,
      );
    return response.json();
  }
  if (!isAlertJob(name)) {
    return {
      processedAt: new Date().toISOString(),
      description: describeJob(name),
    };
  }
  if (!options.internalSecret) {
    throw new Error(
      'INTERNAL_JOB_SECRET is required for missed-log alert jobs.',
    );
  }
  const response = await (options.fetcher ?? fetch)(
    `${options.apiUrl.replace(/\/$/, '')}/missed-log-alerts/process-due`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-job-secret': options.internalSecret,
      },
      body: JSON.stringify({
        stage:
          name === 'missed-session-reminder'
            ? 'FACULTY_MISSED_LOG'
            : 'CAMPUS_MANAGER_ESCALATION',
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Missed-log alert scan failed with HTTP ${response.status}.`,
    );
  }
  return response.json();
}

export function describeJob(name: MiraiJobName): string {
  const descriptions: Record<MiraiJobName, string> = {
    'weekly-academic-summary':
      'Prepare personalized weekly summaries and deliver them to authorized faculty and managers.',
    'health-check':
      'Verify that the background worker can process queued work.',
    'missed-session-reminder':
      'Remind faculty about a session not logged by end of day.',
    'campus-manager-escalation':
      'Escalate a session that remains unlogged after 48 hours.',
    'recalculate-planned-dates':
      'Shift affected topic dates after a calendar change.',
    'semester-import':
      'Process a previously validated semester import as one tracked job.',
    'generate-scheduled-sessions':
      'Generate dated teaching sessions from the active weekly timetable and academic calendar.',
  };

  return descriptions[name];
}

function isAlertJob(name: MiraiJobName): name is AlertJobName {
  return (
    name === 'missed-session-reminder' || name === 'campus-manager-escalation'
  );
}
