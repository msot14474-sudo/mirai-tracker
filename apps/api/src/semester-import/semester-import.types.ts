export const setupColumns = [
  'campus_code',
  'campus_name',
  'campus_timezone',
  'semester_name',
  'semester_start_date',
  'semester_end_date',
  'working_saturday_rule',
  'on_track_threshold',
  'tight_threshold',
  'track_code',
  'track_name',
  'batch_code',
  'batch_name',
  'subject_code',
  'subject_name',
  'subject_description',
  'target_finish_date',
] as const;

export const calendarColumns = [
  'campus_code',
  'semester_name',
  'date',
  'type',
  'title',
  'teaching_allowed',
  'notes',
] as const;

export type SetupColumn = (typeof setupColumns)[number];
export type CalendarColumn = (typeof calendarColumns)[number];

export type ImportIssue = {
  sheet: string;
  rowNumber: number;
  columnName: string | null;
  submittedValue: string | null;
  errorMessage: string;
};

export type SemesterSetupRow = {
  rowNumber: number;
  campusCode: string;
  campusName: string;
  campusTimezone: string;
  semesterName: string;
  semesterStartDate: string;
  semesterEndDate: string;
  workingSaturdayRule: 'ALL' | 'NONE' | 'SECOND_AND_FOURTH';
  onTrackThreshold: number;
  tightThreshold: number;
  trackCode: string;
  trackName: string;
  batchCode: string;
  batchName: string;
  subjectCode: string;
  subjectName: string;
  subjectDescription: string | null;
  targetFinishDate: string;
};

export type CalendarImportRow = {
  rowNumber: number;
  campusCode: string;
  semesterName: string;
  date: string;
  type: 'HOLIDAY' | 'EVENT' | 'EXTRA_WORKING_DAY' | 'CAMPUS_CLOSED';
  title: string;
  teachingAllowed: boolean;
  notes: string | null;
};

export type SemesterImportData = {
  setupRows: SemesterSetupRow[];
  calendarRows: CalendarImportRow[];
};

export type ImportCounts = {
  rows: number;
  campuses: number;
  semesters: number;
  tracks: number;
  batches: number;
  subjects: number;
  offerings: number;
  calendarDays: number;
};

export type SemesterImportPreview = {
  valid: boolean;
  fileName: string;
  counts: ImportCounts;
  issues: ImportIssue[];
  data: SemesterImportData;
};

export type UploadedImportFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
