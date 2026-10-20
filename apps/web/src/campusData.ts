import { apiFetch, apiUrl } from './http';
export async function campusRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(`${apiUrl}/campus-data${path}`, init);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      Array.isArray(error?.message)
        ? error.message.join(' ')
        : error?.message || 'Could not complete this request.',
    );
  }
  return response.json() as Promise<T>;
}
export async function campusDownload(path: string, name: string) {
  const response = await apiFetch(`${apiUrl}/campus-data${path}`);
  if (!response.ok)
    throw new Error('Download could not be prepared. Please try again.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const campusPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export type BundlePreview = {
  valid: boolean;
  fingerprint: string;
  alreadyImported: boolean;
  importId?: string;
  counts: Record<string, number>;
  issues: { location: string; message: string }[];
  warnings: { location: string; message: string }[];
  skippedSheets: string[];
  rows: { dataset: string; location: string; values: Record<string, string> }[];
};
export type VisitingDashboard = {
  semester: { id: string; name: string; campus: string; timezone: string };
  currency: string;
  month: string | null;
  generatedAt: string;
  unresolvedClasses: number;
  summary: {
    faculty: number;
    takenClasses: number;
    teachingHours: number;
    unpricedClasses: number;
    honorarium: number;
    expenses: number;
    paid: number;
    totalCost: number;
    balance: number;
  };
  faculty: {
    id: string;
    name: string;
    email: string;
    employeeCode: string;
    active: boolean;
    subjects: { name: string; code: string; batch: string; active: boolean }[];
    rates: { effectiveFrom: string; ratePerClass: number }[];
    scheduledClasses: number;
    takenClasses: number;
    teachingHours: number;
    unpricedClasses: number;
    honorarium: number;
    expenses: number;
    paid: number;
    totalCost: number;
    balance: number;
  }[];
  classes: {
    id: string;
    staffProfileId: string;
    facultyName: string;
    date: string;
    startsAt: string;
    endsAt: string;
    subject: string;
    subjectCode: string;
    batch: string;
    status: string;
    logged: boolean;
    taken: boolean;
    minutes: number;
    rate: number | null;
    amount: number | null;
  }[];
  ledger: {
    id: string;
    staffProfileId: string;
    date: string;
    kind: string;
    category: string;
    amount: number;
    notes: string;
  }[];
};
export const campusDataKeys = [
  'campus-data',
  'academic',
  'timetable',
  'lesson-plans',
  'topic-schedules',
  'progress',
  'exam-readiness',
  'student-view',
  'session-logs',
  'faculty-overview',
  'faculty-access',
  'managed-accounts',
  'campus-analytics',
  'ai-insights',
];
