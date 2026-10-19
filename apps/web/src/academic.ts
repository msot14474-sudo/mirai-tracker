import { apiFetch, apiUrl } from './http';
export type Campus = {
  id: string;
  code: string;
  name: string;
  timezone: string;
};

export type SaturdayRule = 'ALL' | 'NONE' | 'SECOND_AND_FOURTH';

export type Subject = {
  teachers?: Array<{
    campusId: string;
    staffProfile: {
      id: string;
      active: boolean;
      user: { name: string; status: string };
    };
  }>;
  offerings?: Array<{
    id: string;
    batch: { name: string; semester: { name: string } };
    faculty: Array<{ staffProfile: { id: string; user: { name: string } } }>;
  }>;
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type Semester = {
  id: string;
  campusId: string;
  name: string;
  startDate: string;
  endDate: string;
  workingSaturdayRule: SaturdayRule;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  _count?: { calendarDays: number; examWindows: number };
};

export type CalendarDay = {
  date: string;
  weekday: string;
  working: boolean;
  reason: string;
  override: {
    id?: string;
    type: string;
    title: string;
    teachingAllowed: boolean;
  } | null;
};

export type GeneratedCalendar = {
  semester: Semester & { campus: Campus };
  days: CalendarDay[];
  summary: {
    totalDays: number;
    workingDays: number;
    nonWorkingDays: number;
  };
  exams: Array<{
    id: string;
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    syllabusDeadline: string;
  }>;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      errors?: Array<{ message: string }>;
    } | null;
    const validation = body?.errors?.map((error) => error.message).join(' ');
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : body?.message;
    throw new Error(
      validation ?? message ?? 'The request could not be completed.',
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type SemesterBatch = {
  id: string; name: string; code: string; track: { name: string };
  subjectOfferings: { id: string; subject: { name: string }; faculty: { staffProfile: { user: { name: string } } }[] }[];
};
export const academicApi = {
  semesterCourses: (id: string) => api<SemesterBatch[]>(`/academic/semesters/${id}/subjects`),
  connectSubjects: (id: string, input: { batchId?: string; batchName?: string; batchCode?: string; trackName?: string; trackCode?: string; subjectIds: string[] }) => api(`/academic/semesters/${id}/subjects`, { method: 'POST', body: JSON.stringify(input) }),
  deleteSemester: (id: string) =>
    api<void>(`/academic/semesters/${id}`, { method: 'DELETE' }),
  subjectFaculty: (campusId: string) =>
    api<Array<{ id: string; user: { name: string } }>>(
      `/academic/campuses/${campusId}/subject-faculty`,
    ),
  assignSubjectTeacher: (
    subjectId: string,
    input: { campusId: string; staffProfileId: string; offeringId?: string },
  ) =>
    api<{ assigned: boolean; subject?: Subject }>(`/academic/subjects/${subjectId}/teacher`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteSubject: (id: string) =>
    api<void>(`/academic/subjects/${id}`, { method: 'DELETE' }),
  campuses: () => api<Campus[]>('/academic/campuses'),
  subjects: (campusId?: string) =>
    api<Subject[]>(
      `/academic/subjects${campusId ? '?campusId=' + encodeURIComponent(campusId) : ''}`,
    ),
  createSubject: (input: {
    semesterId?: string; batchId?: string; batchName?: string; batchCode?: string; trackName?: string; trackCode?: string;
    campusId?: string;
    code: string;
    name: string;
    description: string | null;
  }) =>
    api<Subject>('/academic/subjects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  semesters: (campusId: string) =>
    api<Semester[]>(`/academic/campuses/${campusId}/semesters`),
  createSemester: (
    campusId: string,
    input: {
      name: string;
      startDate: string;
      endDate: string;
      workingSaturdayRule: SaturdayRule;
    },
  ) =>
    api<Semester>(`/academic/campuses/${campusId}/semesters`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  calendar: (semesterId: string) =>
    api<GeneratedCalendar>(`/academic/semesters/${semesterId}/calendar`),
  updateCalendarDay: (
    id: string,
    input: { title: string; type: string; teachingAllowed: boolean },
  ) =>
    api(`/academic/calendar-days/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  createCalendarDay: (
    semesterId: string,
    input: {
      date: string;
      type: 'HOLIDAY' | 'EVENT' | 'EXTRA_WORKING_DAY' | 'CAMPUS_CLOSED';
      title: string;
      teachingAllowed: boolean;
    },
  ) =>
    api(`/academic/semesters/${semesterId}/calendar-days`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createExamWindow: (
    semesterId: string,
    input: {
      name: string;
      type: 'SESSIONAL' | 'MID_TERM' | 'PUT' | 'END_TERM' | 'OTHER';
      startDate: string;
      endDate: string;
      syllabusDeadline: string;
    },
  ) =>
    api(`/academic/semesters/${semesterId}/exam-windows`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export function dateOnly(value: string) {
  return value.slice(0, 10);
}
