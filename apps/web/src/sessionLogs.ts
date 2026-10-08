export type SessionLogStatus =
  'COMPLETED' | 'IN_PROGRESS' | 'SKIPPED' | 'MERGED' | 'CANCELLED';

export type WorkStatus =
  'NOT_APPLICABLE' | 'NOT_ASSIGNED' | 'ASSIGNED' | 'PARTIAL' | 'COMPLETED';

export type TopicLogInput = {
  topicId: string;
  completionAfterPercentage: number;
  minutesUsed: number | null;
  notes: string | null;
};

export type SessionLogInput = {
  status: SessionLogStatus;
  overallCompletionPercentage: number;
  coveredSummary: string;
  leftOverSummary: string | null;
  carryForwardTopicId: string | null;
  classworkStatus: WorkStatus;
  homeworkStatus: WorkStatus;
  notes: string | null;
  mergedIntoSessionId: string | null;
  cancellationReason: string | null;
  clientElapsedSeconds?: number;
  topicUpdates: TopicLogInput[];
};

export type FacultySession = {
  id: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  plannedMinutes: number;
  status: string;
  isExtraSession: boolean;
  subject: { id: string; code: string; name: string };
  batch: { id: string; code: string; name: string };
  campus: { id: string; code: string; name: string; timezone: string };
  plan: { id: string; version: number; status: string } | null;
  topics: Array<{
    id: string;
    unitSequence: number;
    unitTitle: string;
    sequence: number;
    title: string;
    plannedMinutes: number;
    status: string;
    currentCompletionPercentage: number;
    plannedStartDate: string | null;
    plannedFinishDate: string | null;
  }>;
  latestLog: {
    id: string;
    revision: number;
    status: SessionLogStatus;
    loggedAt: string;
  } | null;
  prefill: SessionLogInput;
};

export type SessionLogDay = {
  date: string;
  sessions: FacultySession[];
  mergeTargets: Array<{
    id: string;
    sessionDate: string;
    startsAt: string;
    subject: { code: string; name: string };
    batch: { code: string; name: string };
  }>;
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
    errors?: Array<{ message: string }>;
  } | null;
  const validation = body?.errors?.map((entry) => entry.message).join(' ');
  const message = Array.isArray(body?.message)
    ? body.message.join(' ')
    : body?.message;
  return validation ?? message ?? 'The session log could not be saved.';
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  return response.json() as Promise<T>;
}

export const sessionLogApi = {
  forDate: (date: string) =>
    api<SessionLogDay>(
      `/session-logs/sessions?date=${encodeURIComponent(date)}`,
    ),
  create: (sessionId: string, input: SessionLogInput) =>
    api(`/session-logs/sessions/${sessionId}/logs`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
