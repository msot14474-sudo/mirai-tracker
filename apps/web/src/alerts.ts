import { apiFetch, apiUrl } from './http';
export type MissedLogAlertType =
  'FACULTY_MISSED_LOG' | 'CAMPUS_MANAGER_ESCALATION';
export type MissedLogAlertStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export type MissedLogAlert = {
  id: string;
  type: MissedLogAlertType;
  status: MissedLogAlertStatus;
  dueAt: string;
  sentAt: string | null;
  subject: { code: string; name: string };
  batch: { code: string; name: string };
  campus: { id: string; code: string; name: string; timezone: string };
  session: { id: string; date: string; startsAt: string; endsAt: string };
  deliveries: Array<{
    channel: 'EMAIL' | 'WHATSAPP' | 'TELEGRAM' | 'IN_APP';
    status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
    sentAt: string | null;
    deliveredAt: string | null;
  }>;
};

export type MissedLogAlertFeed = {
  summary: {
    total: number;
    facultyReminders: number;
    managerEscalations: number;
    failed: number;
  };
  alerts: MissedLogAlert[];
};

async function messageFrom(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  return Array.isArray(body?.message)
    ? body.message.join(' ')
    : (body?.message ?? 'Missed-log alerts could not be loaded.');
}

export const alertApi = {
  mine: async (campusId?: string): Promise<MissedLogAlertFeed> => {
    const response = await apiFetch(
      `${apiUrl}/missed-log-alerts/me${campusId ? '?campusId=' + encodeURIComponent(campusId) : ''}`,
      {
        credentials: 'include',
      },
    );
    if (!response.ok) throw new Error(await messageFrom(response));
    return response.json() as Promise<MissedLogAlertFeed>;
  },
};
