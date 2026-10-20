import { apiFetch, apiUrl } from './http';
import { ProgressMetrics } from './progress';
export type ReportTab = 'course' | 'delivery' | 'faculty' | 'exams' | 'campus';
export type ReportStatus =
  'ON_TRACK' | 'TIGHT' | 'DANGER' | 'COMPLETE' | 'NEEDS_DATA';
export type ReportFilters = {
  campusId?: string;
  trackId?: string;
  semesterId?: string;
  batchId?: string;
  subjectId?: string;
  facultyId?: string;
  from?: string;
  to?: string;
  tab?: ReportTab;
  deliveryStatus?: string;
};
export type ReportIdentity = { id: string; name: string; code?: string };
export type ReportBase = {
  id: string;
  subject: ReportIdentity;
  campus: ReportIdentity;
  semester: ReportIdentity;
  batch: ReportIdentity;
  track: ReportIdentity;
  teachers: ReportIdentity[];
};
export type ReportMetrics = ProgressMetrics & { overdueTopicIds: string[] };
export type CourseReport = ReportBase & {
  status: ReportStatus;
  reason: string;
  metrics: ReportMetrics | null;
  deadline: string;
  planStatus: string | null;
  planVersion: number | null;
  scheduled: number;
  logged: number;
  unlogged: number;
  upcoming: number;
  nextTopic: string | null;
  reviewChanges: number;
};
export type ExamReport = ReportBase & {
  examId: string;
  exam: string;
  date: string;
  endDate: string;
  deadline: string;
  status: ReportStatus;
  scopeMode: string;
  coverage: number | null;
  remainingHours: number | null;
  teachingHours: number;
  bufferRatio: number | null;
  scopeTopics: number;
  reason: string;
};
export type DeliveryReport = ReportBase & {
  date: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  teacher: ReportIdentity;
  status: string;
  revision: number;
  loggedAt: string;
  scheduledHours: number;
  recordedTopicHours: number | null;
  completion: number | null;
  covered: string;
  leftOver: string;
  carryForward: string;
  classwork: string;
  homework: string;
  notes: string;
};
export type FacultyReport = {
  id: string;
  name: string;
  subjects: string[];
  sessionsLogged: number;
  classesTaught: number;
  scheduledHours: number;
  plansUploaded: number;
  lastActivity: string | null;
  recent: { date: string; action: string; subject: string }[];
};
export type GroupReport = {
  id: string;
  kind: 'campus' | 'track';
  name: string;
  campus: string;
  subjectCount: number;
  needsData: number;
  status: ReportStatus;
  worstSubject: string;
  metrics: ProgressMetrics | null;
  logged: number;
  unlogged: number;
};
export type ReportsData = {
  generatedAt: string;
  facultyOnly: boolean;
  options: ReportBase[];
  subjects: CourseReport[];
  exams: ExamReport[];
  delivery: DeliveryReport[];
  faculty: FacultyReport[];
  groups: GroupReport[];
  summary: {
    status: ReportStatus;
    worstSubject: string | null;
    metrics: ProgressMetrics | null;
    subjects: number;
    assessed: number;
    needsData: number;
    atRisk: number;
    behindHours: number;
    logged: number;
    unlogged: number;
    upcoming: number;
    nextExam: { name: string; date: string; campus: string } | null;
  };
};
function query(filters: ReportFilters) {
  return new URLSearchParams(
    Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString();
}
export const reportsApi = {
  async read(filters: ReportFilters): Promise<ReportsData> {
    const response = await apiFetch(`${apiUrl}/reports?${query(filters)}`);
    const data = await response.json();
    if (!data?.summary || !Array.isArray(data.subjects))
      throw new Error('Reports could not be loaded. Please retry.');
    return data;
  },
  async csv(filters: ReportFilters) {
    const response = await apiFetch(`${apiUrl}/reports/csv?${query(filters)}`);
    return {
      blob: await response.blob(),
      filename: `mirai-${filters.tab ?? 'course'}-report.csv`,
    };
  },
};
export const statusLabel = (status: string) =>
  ({
    ON_TRACK: 'On track',
    TIGHT: 'Tight',
    DANGER: 'Danger',
    COMPLETE: 'Complete',
    NEEDS_DATA: 'Needs data',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
  })[status] ?? status.toLowerCase().replaceAll('_', ' ');
export const reportNumber = (n: number | null | undefined, suffix = '') =>
  n == null
    ? '—'
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)}${suffix}`;
export const reportDate = (s: string) =>
  new Date(s.slice(0, 10) + 'T12:00:00Z').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
