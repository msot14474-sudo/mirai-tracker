export type Campus = {
  id: string;
  code: string;
  name: string;
  timezone: string;
};

export type SaturdayRule = 'ALL' | 'NONE' | 'SECOND_AND_FOURTH';

export type Subject = {
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

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
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

export const academicApi = {
  campuses: () => api<Campus[]>('/academic/campuses'),
  subjects: () => api<Subject[]>('/academic/subjects'),
  createSubject: (input: {
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
