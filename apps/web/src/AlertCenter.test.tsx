import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertCenter } from './AlertCenter';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCenter(response = feed()) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AlertCenter />
    </QueryClientProvider>,
  );
}

describe('AlertCenter', () => {
  it('keeps operational alerts without the workflow tutorial', async () => {
    renderCenter();
    expect(
      await screen.findByRole('heading', { name: 'Missed-log alerts' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Data Structures')).toBeInTheDocument();
    expect(screen.queryByText('End of campus day')).not.toBeInTheDocument();
    expect(screen.queryByText('48 hours after class')).not.toBeInTheDocument();
  });

  it('shows a manager escalation and its delivery evidence', async () => {
    renderCenter();
    expect(await screen.findByText('48-hour escalation')).toBeInTheDocument();
    expect(screen.getByText('Data Structures')).toBeInTheDocument();
    expect(screen.getByText('Email · Sent')).toBeInTheDocument();
    expect(screen.getByText('In app · Delivered')).toBeInTheDocument();
  });

  it('shows a clear empty state without action controls', async () => {
    renderCenter({
      summary: {
        total: 0,
        facultyReminders: 0,
        managerEscalations: 0,
        failed: 0,
      },
      alerts: [],
    });
    expect(
      await screen.findByText('No missed-log alerts'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

function feed() {
  return {
    summary: {
      total: 1,
      facultyReminders: 0,
      managerEscalations: 1,
      failed: 0,
    },
    alerts: [
      {
        id: 'alert-a',
        type: 'CAMPUS_MANAGER_ESCALATION',
        status: 'SENT',
        dueAt: '2026-10-10T10:00:00.000Z',
        sentAt: '2026-10-10T10:00:05.000Z',
        subject: { code: 'CS-DSA', name: 'Data Structures' },
        batch: { code: 'MIRAI-A', name: 'Mirai Sample Batch A' },
        campus: {
          id: 'campus-a',
          code: 'HI-TECH',
          name: 'HI-Tech Campus',
          timezone: 'Asia/Kolkata',
        },
        session: {
          id: 'session-a',
          date: '2026-10-08',
          startsAt: '2026-10-08T08:30:00.000Z',
          endsAt: '2026-10-08T10:00:00.000Z',
        },
        deliveries: [
          {
            channel: 'IN_APP',
            status: 'DELIVERED',
            sentAt: null,
            deliveredAt: null,
          },
          { channel: 'EMAIL', status: 'SENT', sentAt: null, deliveredAt: null },
        ],
      },
    ],
  };
}
