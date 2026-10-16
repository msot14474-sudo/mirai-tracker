import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SemesterImport } from './SemesterImport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const counts = {
  rows: 33,
  campuses: 4,
  semesters: 4,
  tracks: 1,
  batches: 4,
  subjects: 25,
  offerings: 25,
  calendarDays: 8,
};

function renderImport() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SemesterImport />
    </QueryClientProvider>,
  );
}

describe('SemesterImport', () => {
  it('previews a valid file and commits it only after confirmation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/imports') && init?.method === 'POST') {
        return json({
          job: {
            id: 'job-a',
            fileName: 'semester.csv',
            status: 'COMPLETED',
            totalRows: 33,
            successfulRows: 33,
            failedRows: 0,
            createdAt: '2026-10-07T00:00:00.000Z',
            completedAt: '2026-10-07T00:00:01.000Z',
            uploadedBy: {
              id: 'user-a',
              name: 'Manager',
              email: 'manager@mirai.local',
            },
          },
          counts,
        });
      }
      if (url.endsWith('/imports/preview')) {
        return json({
          valid: true,
          fileName: 'semester.csv',
          counts,
          issues: [],
        });
      }
      if (url.endsWith('/imports')) return json([]);
      return new Response(null, { status: 404 });
    });
    renderImport();
    fireEvent.click(
      screen.getByRole('button', { name: 'Semester setup template' }),
    );

    const file = new File(['campus_code'], 'semester.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText('CSV or Excel file'), {
      target: { files: [file] },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Validate file' }).closest('form')!,
    );

    expect(await screen.findByText('Ready to import')).toBeInTheDocument();
    expect(screen.getAllByText('25', { selector: 'strong' })).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm semester import' }),
    );
    expect(
      await screen.findByText('Import complete. 33 rows were committed.'),
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/imports/preview'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
  });

  it('shows row-level issues and keeps confirmation disabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/imports/preview')) {
        return json({
          valid: false,
          fileName: 'semester.csv',
          counts: { ...counts, rows: 1 },
          issues: [
            {
              sheet: 'Semester Setup',
              rowNumber: 12,
              columnName: 'target_finish_date',
              submittedValue: '2027-01-01',
              errorMessage: 'Target finish date must be inside the semester.',
            },
          ],
        });
      }
      return json([]);
    });
    renderImport();
    fireEvent.click(
      screen.getByRole('button', { name: 'Semester setup template' }),
    );

    fireEvent.change(screen.getByLabelText('CSV or Excel file'), {
      target: { files: [new File(['bad'], 'semester.csv')] },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Validate file' }).closest('form')!,
    );

    expect(await screen.findByText('1 issue found')).toBeInTheDocument();
    expect(
      screen.getByText('Target finish date must be inside the semester.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm semester import' }),
    ).toBeDisabled();
  });
});

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
