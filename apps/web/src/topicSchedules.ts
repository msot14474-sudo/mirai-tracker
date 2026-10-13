import { apiFetch, apiUrl } from './http';
export type TopicScheduleOffering = {
  id: string;
  subject: { id: string; code: string; name: string };
  batch: {
    id: string;
    code: string;
    name: string;
    semester: {
      id: string;
      name: string;
      campus: { id: string; code: string; name: string };
    };
  };
  plan: {
    id: string;
    version: number;
    status: string;
    topics: number;
    totalPlannedMinutes: number;
  } | null;
  sessions: number;
  latestSchedule: {
    version: number;
    reason: string;
    calculatedAt: string;
    scheduledTopics: number;
  } | null;
};

export type TopicAllocation = {
  id: string;
  unitSequence: number;
  topicSequence: number;
  unitTitle: string;
  title: string;
  requiredMinutes: number;
  plannedStartDate: string;
  plannedFinishDate: string;
  allocatedMinutes: number;
  sessionIds: string[];
  afterTarget: boolean;
};

export type TopicSchedulePreview = {
  allocations: TopicAllocation[];
  unscheduledTopics: Array<{
    id: string;
    unitSequence: number;
    topicSequence: number;
    unitTitle: string;
    title: string;
    requiredMinutes: number;
    allocatedMinutes: number;
    remainingMinutes: number;
  }>;
  summary: {
    requiredMinutes: number;
    availableMinutes: number;
    allocatedMinutes: number;
    shortfallMinutes: number;
    usableSessions: number;
    excludedSessions: number;
  };
};

export type TopicScheduleDetail = {
  id: string;
  subject: { id: string; code: string; name: string };
  batch: { id: string; code: string; name: string };
  semester: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    campus: { id: string; code: string; name: string };
  };
  targetFinishDate: string;
  plan: {
    id: string;
    version: number;
    status: string;
    topics: number;
    totalPlannedMinutes: number;
  } | null;
  sessions: Array<{
    id: string;
    sessionDate: string;
    startsAt: string;
    endsAt: string;
    plannedMinutes: number;
    status: string;
    cancellationReason: string | null;
    hasLogs: boolean;
    isExtraSession: boolean;
  }>;
  preview: TopicSchedulePreview;
  latestVersion: {
    id: string;
    version: number;
    reason: string;
    calculatedAt: string;
    entries: Array<{
      id: string;
      topicId: string;
      plannedStartDate: string;
      plannedFinishDate: string;
      allocatedMinutes: number;
    }>;
  } | null;
};

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
    errors?: Array<{ message: string }>;
  } | null;
  const validation = body?.errors?.map((entry) => entry.message).join(' ');
  const message = Array.isArray(body?.message)
    ? body.message.join(' ')
    : body?.message;
  return (
    validation ?? message ?? 'The planned-date request could not be completed.'
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  return response.json() as Promise<T>;
}

export const topicScheduleApi = {
  offerings: () => api<TopicScheduleOffering[]>('/topic-schedules/offerings'),
  offering: (offeringId: string) =>
    api<TopicScheduleDetail>(`/topic-schedules/offerings/${offeringId}`),
  calculate: (offeringId: string) =>
    api(`/topic-schedules/offerings/${offeringId}/calculate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  setCancellation: (sessionId: string, cancelled: boolean, reason?: string) =>
    api(`/topic-schedules/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ cancelled, reason }),
    }),
};
