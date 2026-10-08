export type ProgressStatus = 'ON_TRACK' | 'TIGHT' | 'DANGER' | 'COMPLETE';

export type ProgressMetrics = {
  hoursInScope: number;
  coveredHours: number;
  coveragePercentage: number;
  remainingHours: number;
  availableHours: number;
  plannedHoursByToday: number;
  paceVsPlanHours: number;
  bufferRatio: number | null;
  status: ProgressStatus;
};

export type ProgressRollup = ProgressMetrics & {
  subjectCount: number;
  overdueTopics: number;
  statusCounts: Record<ProgressStatus, number>;
};

export type ProgressGroup = ProgressRollup & {
  id: string;
  code: string;
  name: string;
};

export type SubjectProgress = ProgressMetrics & {
  thresholds: { onTrack: number; tight: number };
  id: string;
  targetFinishDate: string;
  subject: { id: string; code: string; name: string };
  batch: { id: string; code: string; name: string };
  track: { id: string; code: string; name: string };
  campus: { id: string; code: string; name: string };
  semester: { id: string; name: string };
  lessonPlan: { id: string; version: number; status: string };
  scheduleVersion: number | null;
  overdueTopics: Array<{
    id: string;
    title: string;
    plannedFinishDate: string | null;
    completionPercentage: number;
  }>;
};

export type ProgressDashboardData = {
  asOfDate: string;
  summary: ProgressRollup | null;
  campuses: ProgressGroup[];
  tracks: ProgressGroup[];
  subjects: SubjectProgress[];
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  return Array.isArray(body?.message)
    ? body.message.join(' ')
    : (body?.message ?? 'The progress dashboard could not be loaded.');
}

export const progressApi = {
  dashboard: async (asOfDate: string): Promise<ProgressDashboardData> => {
    const response = await fetch(
      `${apiUrl}/progress/dashboard?asOf=${encodeURIComponent(asOfDate)}`,
      { credentials: 'include' },
    );
    if (!response.ok) throw new Error(await messageFrom(response));
    return response.json() as Promise<ProgressDashboardData>;
  },
};
