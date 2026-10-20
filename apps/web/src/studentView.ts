import { apiFetch, apiUrl } from './http';
import type { BufferMetrics } from './BufferRatio';
export type StudentTopic = {
  id: string;
  unit: { sequence: number; title: string };
  sequence: number;
  title: string;
  plannedMinutes: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  completionPercentage: number;
  plannedStartDate: string | null;
  plannedFinishDate: string | null;
};

export type StudentSubject = {
  buffer?: BufferMetrics | null;
  track?: { id: string; code: string; name: string };
  id: string;
  subject: { id: string; code: string; name: string };
  teachers: Array<{ id: string; name: string }>;
  weeklyHours: number;
  weeklyClasses: Array<{ id: string; weekday: number; startTime: string; endTime: string }>;
  upcomingClasses: Array<{ id: string; date: string; startsAt: string; endsAt: string; isExtraClass: boolean }>;
  syllabusTopics: StudentTopic[];
  lessonPlan: { id: string; version: number; status: string } | null;
  scheduleVersion: number | null;
  plannedHours: number;
  coveredHours: number;
  coveragePercentage: number | null;
  totalTopics: number;
  completedTopics: number;
  coveredTopics: StudentTopic[];
  comingNextTopics: StudentTopic[];
};

export type StudentExam = {
  id: string;
  name: string;
  type: 'SESSIONAL' | 'MID_TERM' | 'PUT' | 'END_TERM' | 'OTHER';
  startDate: string;
  endDate: string;
  syllabusDeadline: string;
  daysUntilExam: number;
  isOngoing?: boolean;
  subjects: Array<{
    id: string;
    subject: { id: string; code: string; name: string };
    topics: StudentTopic[];
  }>;
};

export type StudentOverviewData = {
  asOfDate: string;
  batch: {
    id: string;
    code: string;
    name: string;
    tracks?: { id: string; code: string; name: string }[];
    track?: { id: string; code: string; name: string };
    semester: {
      id: string;
      name: string;
      startDate?: string;
      endDate?: string;
      campus: { id: string; code: string; name: string; timezone?: string };
    };
  };
  subjects: StudentSubject[];
  exams: StudentExam[];
};

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  return Array.isArray(body?.message)
    ? body.message.join(' ')
    : (body?.message ?? 'Your course overview could not be loaded.');
}

export const studentViewApi = {
  overview: async (asOfDate: string): Promise<StudentOverviewData> => {
    const response = await apiFetch(
      `${apiUrl}/student/overview?asOf=${encodeURIComponent(asOfDate)}`,
      { credentials: 'include' },
    );
    if (!response.ok) throw new Error(await messageFrom(response));
    return response.json() as Promise<StudentOverviewData>;
  },
};
