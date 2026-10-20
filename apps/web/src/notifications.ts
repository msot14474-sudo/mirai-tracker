import { apiFetch, apiUrl } from './http';
export async function notificationRequest<T>(
  path = '',
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(`${apiUrl}/notifications${path}`, init);
  if (!response.ok)
    throw new Error('Notifications could not be loaded. Please try again.');
  return response.json();
}
export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  actorName: string;
  campusId?: string;
  category: string;
  view: string;
  createdAt: string;
  read: boolean;
};
export type WeeklySummary = {
  id: string;
  title: string;
  text: string;
  mode: string;
  weekStart: string;
  weekEnd: string;
  createdAt: string;
  emailStatus: string;
  emailSentAt?: string;
};
