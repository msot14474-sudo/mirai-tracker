import { apiFetch, apiUrl } from './http';
export type ExportType =
  | 'FULL_DATA'
  | 'CAMPUS_PROGRESS'
  | 'SUBJECT_PROGRESS'
  | 'VISITING_FACULTY_HONORARIUM';

export type ExportRequest =
  | { type: 'FULL_DATA' }
  | { type: 'CAMPUS_PROGRESS'; asOf: string }
  | { type: 'SUBJECT_PROGRESS'; asOf: string }
  | {
      type: 'VISITING_FACULTY_HONORARIUM';
      month: string;
      ratePerLecture: number;
    };

export type ExportJob = {
  id: string;
  type: ExportType;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  storageKey: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string; email: string };
};

async function errorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  return Array.isArray(body?.message)
    ? body.message.join(' ')
    : (body?.message ?? 'The export could not be created.');
}

export const exportApi = {
  history: async (): Promise<ExportJob[]> => {
    const response = await apiFetch(`${apiUrl}/exports`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<ExportJob[]>;
  },

  download: async (request: ExportRequest) => {
    const response = await apiFetch(`${apiUrl}/exports`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename =
      disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'mirai-export.csv';
    return { blob: await response.blob(), filename };
  },
};

export function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
