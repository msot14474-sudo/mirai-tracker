import { apiFetch, apiUrl } from './http';
export type LessonPlanOffering = {
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
    units: number;
    topics: number;
    totalPlannedMinutes: number;
  } | null;
};

export type LessonPlanPreview = {
  valid: boolean;
  mode?: 'APPEND' | 'REPLACE';
  basePlanId?: string;
  changes?: { added: number; unchanged: number };
  fileName: string;
  counts: {
    rows: number;
    units: number;
    topics: number;
    totalPlannedMinutes: number;
  };
  issues: Array<{
    sheet: string;
    rowNumber: number;
    columnName: string | null;
    submittedValue: string | null;
    errorMessage: string;
  }>;
};

export type LessonPlanDetail = {
  id: string;
  subject: { id: string; code: string; name: string };
  batch: { id: string; code: string; name: string };
  semester: {
    id: string;
    name: string;
    campus: { id: string; code: string; name: string };
  };
  examWindows: Array<{
    id: string;
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    syllabusDeadline: string;
  }>;
  plans: Array<{
    id: string;
    version: number;
    status: string;
    fileName: string | null;
    summary: PlanSummary;
  }>;
  plan: {
    id: string;
    version: number;
    status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
    fileName: string | null;
    uploadedBy: { id: string; name: string; email: string };
    approvedBy: { id: string; name: string; email: string } | null;
    approvedAt: string | null;
    createdAt: string;
    units: LessonPlanUnit[];
    summary: PlanSummary;
  } | null;
};

export type PlanSummary = {
  units: number;
  topics: number;
  totalPlannedMinutes: number;
};

export type LessonPlanUnit = {
  id: string;
  sequence: number;
  title: string;
  description: string | null;
  topics: Array<{
    id: string;
    sequence: number;
    title: string;
    description: string | null;
    plannedMinutes: number;
    status: string;
    currentCompletionPercentage: number;
    examScopes: Array<{ id: string; name: string }>;
  }>;
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
    validation ?? message ?? 'The lesson-plan request could not be completed.'
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers:
      init?.body && typeof init.body === 'string'
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type PlanImportOptions = {
  mode: 'APPEND' | 'REPLACE';
  basePlanId?: string;
};
async function upload<T>(
  path: string,
  file: File,
  options?: PlanImportOptions,
) {
  const body = new FormData();
  body.append('file', file);
  if (options) {
    body.append('mode', options.mode);
    if (options.basePlanId) body.append('basePlanId', options.basePlanId);
  }
  return api<T>(path, { method: 'POST', body });
}

export const lessonPlanApi = {
  offerings: (campusId?: string) =>
    api<LessonPlanOffering[]>(
      `/lesson-plans/offerings${campusId ? '?campusId=' + encodeURIComponent(campusId) : ''}`,
    ),
  offering: (offeringId: string) =>
    api<LessonPlanDetail>(`/lesson-plans/offerings/${offeringId}`),
  preview: (offeringId: string, file: File, options?: PlanImportOptions) =>
    upload<LessonPlanPreview>(
      `/lesson-plans/offerings/${offeringId}/preview`,
      file,
      options,
    ),
  import: (offeringId: string, file: File, options?: PlanImportOptions) =>
    upload<{ added?: number; unchanged?: number; warnings?: string[] }>(
      `/lesson-plans/offerings/${offeringId}/import`,
      file,
      options,
    ),
  updateUnit: (
    unitId: string,
    input: { title: string; description: string | null },
  ) =>
    api(`/lesson-plans/units/${unitId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  updateTopic: (
    topicId: string,
    input: {
      title: string;
      description: string | null;
      plannedMinutes: number;
    },
  ) =>
    api(`/lesson-plans/topics/${topicId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  setExamScope: (planId: string, examWindowId: string, topicIds: string[]) =>
    api(`/lesson-plans/plans/${planId}/exam-scopes/${examWindowId}`, {
      method: 'PUT',
      body: JSON.stringify({ topicIds }),
    }),
  activate: (planId: string) =>
    api(`/lesson-plans/plans/${planId}/activate`, { method: 'POST' }),
  templateUrl: (format: 'csv' | 'xlsx') =>
    `${apiUrl}/lesson-plans/template?format=${format}`,
};

export function formatTeachingTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
