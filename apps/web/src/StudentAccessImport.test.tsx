import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StudentAccessImport } from './StudentAccessImport';
import { saveDownload } from './exports';
vi.mock('./exports', () => ({ saveDownload: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <StudentAccessImport campusId="campus-a" />
    </QueryClientProvider>,
  );
}
it('exposes separate Excel/CSV templates and exports for the selected campus', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async (url) =>
        new Response(
          String(url).includes('/students/') ? 'Name,Campus,Email\r\n' : '[]',
          { status: 200 },
        ),
    );
  show();
  expect(
    screen.getByRole('button', { name: 'Excel template' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Export students Excel' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'CSV template' }));
  await waitFor(() =>
    expect(saveDownload).toHaveBeenCalledWith(
      expect.objectContaining({ size: 19, type: expect.any(String) }),
      'student-access-template.csv',
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Export students CSV' }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Export students CSV' }));
  await waitFor(() =>
    expect(saveDownload).toHaveBeenCalledWith(
      expect.objectContaining({ size: 19, type: expect.any(String) }),
      'campus-students.csv',
    ),
  );
  expect(fetch.mock.calls.map(([url]) => String(url))).toContainEqual(
    expect.stringContaining(
      '/faculty-access/campuses/campus-a/students/export?format=csv',
    ),
  );
  expect(
    screen.getByText(/Forgot password on the login page/),
  ).toBeInTheDocument();
});
it('shows permission errors without downloading an error response as a student file', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    String(url).includes('/students/')
      ? new Response(
          JSON.stringify({ message: 'You cannot manage this campus.' }),
          { status: 403 },
        )
      : new Response('[]', { status: 200 }),
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Export students CSV' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'You cannot manage this campus.',
  );
  expect(saveDownload).not.toHaveBeenCalled();
});
