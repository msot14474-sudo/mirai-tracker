import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RequestRecovery, AppErrorBoundary } from './RequestRecovery';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('offers recovery for active failed data without retrying inactive workspaces', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce('Recovered data');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Workspace() {
    const query = useQuery({ queryKey: ['active'], queryFn: load });
    return <p>{query.data}</p>;
  }
  render(
    <QueryClientProvider client={client}>
      <RequestRecovery />
      <Workspace />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Recovered data')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Try again' }),
  ).not.toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
  client.clear();
});
it('contains a rendering failure instead of leaving a blank page', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken(): never {
    throw new Error('Render failed');
  }
  render(
    <AppErrorBoundary>
      <Broken />
    </AppErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This page could not be displayed',
  );
  expect(
    screen.getByRole('button', { name: 'Reload page' }),
  ).toBeInTheDocument();
});
