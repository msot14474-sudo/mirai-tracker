import { apiFetch, apiUrl } from './http';
export type TimetableEntry = {
  id: string;
  facultyAssignmentId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  plannedMinutes: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  facultyName?: string | null;
};

export type OfferingListItem = {
  id: string;
  subject: { id: string; code: string; name: string };
  batch: { id: string; code: string; name: string };
  targetFinishDate: string;
  entries: TimetableEntry[];
  weeklyPlannedMinutes: number;
  generatedSessions: number;
};

export type SemesterOfferings = {
  semester: {
    id: string;
    campusId: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  offerings: OfferingListItem[];
};

export type OfferingTimetable = {
  id: string;
  subject: { id: string; code: string; name: string };
  batch: { id: string; code: string; name: string };
  semester: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    campus: { id: string; code: string; name: string; timezone: string };
  };
  facultyAssignments: Array<{
    id: string;
    type: string;
    active: boolean;
    startDate: string;
    endDate: string | null;
    staff: { id: string; name: string; email: string };
  }>;
  entries: TimetableEntry[];
  sessions: Array<{
    id: string;
    timetableEntryId: string | null;
    sessionDate: string;
    startsAt: string;
    endsAt: string;
    plannedMinutes: number;
    status: string;
    hasLogs?: boolean;
  }>;
  summary: {
    weeklyPlannedMinutes: number;
    generatedSessions: number;
    semesterPlannedMinutes: number;
  };
};

export type TimetableEntryInput = {
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
  facultyAssignmentId: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers:
      init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      errors?: Array<{ message: string }>;
    } | null;
    const validation = body?.errors?.map((entry) => entry.message).join(' ');
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : body?.message;
    throw new Error(
      validation ?? message ?? 'The timetable request could not be completed.',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const timetableApi = {
  moveSession: (
    sessionId: string,
    input: { date: string; startTime: string; endTime: string; reason: string },
  ) =>
    api(`/timetable/sessions/${sessionId}/move`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  offerings: (semesterId: string) =>
    api<SemesterOfferings>(`/timetable/semesters/${semesterId}/offerings`),
  offering: (offeringId: string) =>
    api<OfferingTimetable>(`/timetable/offerings/${offeringId}`),
  updateEntry: (entryId: string, input: TimetableEntryInput) =>
    api(`/timetable/entries/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  batchTemplate: `${apiUrl}/timetable/batch-template`,
  importBatch: (batchId: string, file: File, commit = false) => {
    const body = new FormData();
    body.set('file', file);
    return api<BatchTimetablePreview>(
      `/timetable/batches/${batchId}/${commit ? 'import' : 'preview'}`,
      { method: 'POST', body },
    );
  },
  createEntry: (offeringId: string, input: TimetableEntryInput) =>
    api(`/timetable/offerings/${offeringId}/entries`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  archiveEntry: (entryId: string) =>
    api<void>(`/timetable/entries/${entryId}`, { method: 'DELETE' }),
  generate: (offeringId: string) =>
    api(`/timetable/offerings/${offeringId}/generate`, { method: 'POST' }),
};

export type BatchTimetablePreview = {
  batch: { id: string; name: string };
  valid: boolean;
  added: number;
  rows: Array<
    TimetableEntryInput & {
      source: string;
      subject: string;
      teacher: string;
      existing: boolean;
    }
  >;
  errors: Array<{ source: string; message: string }>;
  warnings?: string[];
};
