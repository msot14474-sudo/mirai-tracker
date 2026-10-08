export type ImportIssue = {
  sheet: string;
  rowNumber: number;
  columnName: string | null;
  submittedValue: string | null;
  errorMessage: string;
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

export type ImportPreview = {
  valid: boolean;
  fileName: string;
  counts: ImportCounts;
  issues: ImportIssue[];
};

export type ImportJob = {
  id: string;
  fileName: string;
  status:
    | 'UPLOADED'
    | 'VALIDATING'
    | 'VALIDATED'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'COMPLETED_WITH_ERRORS'
    | 'FAILED';
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  createdAt: string;
  completedAt: string | null;
  uploadedBy: { id: string; name: string; email: string };
  _count?: { errors: number };
  errors?: ImportIssue[];
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(body?.message)) return body.message.join(' ');
  return body?.message ?? 'The import request could not be completed.';
}

async function upload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    credentials: 'include',
    body,
  });
  if (!response.ok) throw new Error(await messageFrom(response));
  return response.json() as Promise<T>;
}

export const importApi = {
  preview: (file: File) => upload<ImportPreview>('/imports/preview', file),
  execute: (file: File) =>
    upload<{ job: ImportJob; counts?: ImportCounts; preview?: ImportPreview }>(
      '/imports',
      file,
    ),
  jobs: async () => {
    const response = await fetch(`${apiUrl}/imports`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(await messageFrom(response));
    return response.json() as Promise<ImportJob[]>;
  },
  templateUrl: (format: 'csv' | 'xlsx') =>
    `${apiUrl}/imports/template?format=${format}`,
  errorReportUrl: (jobId: string) => `${apiUrl}/imports/${jobId}/errors.csv`,
};
