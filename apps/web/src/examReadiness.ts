import { apiFetch, apiUrl } from './http';
import type { BufferMetrics } from './BufferRatio';
export type ExamReadinessMetrics = {
  topicsInScope: number;
  completedTopics: number;
  plannedHours: number;
  coveredHours: number;
  coveragePercentage: number | null;
  hoursStillNeeded: number;
};

export type ExamReadinessTopic = {
  id: string;
  title: string;
  plannedMinutes: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  completionPercentage: number;
};

export type ExamReadinessSubject = ExamReadinessMetrics & {
  buffer?: BufferMetrics | null;
  id: string;
  subject: { id: string; code: string; name: string };
  batch: { id: string; code: string; name: string };
  track: { id: string; code: string; name: string };
  lessonPlan: { id: string; version: number; status: string };
  topics: ExamReadinessTopic[];
};

export type ExamReadinessExam = ExamReadinessMetrics & {
  id: string;
  name: string;
  type: 'SESSIONAL' | 'MID_TERM' | 'PUT' | 'END_TERM' | 'OTHER';
  startDate: string;
  endDate: string;
  syllabusDeadline: string;
  daysUntilExam: number;
  deadlinePassed: boolean;
  semester: { id: string; name: string };
  campus: { id: string; code: string; name: string };
  subjects: ExamReadinessSubject[];
};

export type ExamReadinessData = {
  asOfDate: string;
  exams: ExamReadinessExam[];
};

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  return Array.isArray(body?.message)
    ? body.message.join(' ')
    : (body?.message ?? 'Exam readiness could not be loaded.');
}

export const examReadinessApi = {
  list: async (
    asOfDate: string,
    campusId?: string,
  ): Promise<ExamReadinessData> => {
    const response = await apiFetch(
      `${apiUrl}/progress/exam-readiness?asOf=${encodeURIComponent(asOfDate)}${campusId ? '&campusId=' + encodeURIComponent(campusId) : ''}`,
      { credentials: 'include' },
    );
    if (!response.ok) throw new Error(await messageFrom(response));
    return response.json() as Promise<ExamReadinessData>;
  },
};
