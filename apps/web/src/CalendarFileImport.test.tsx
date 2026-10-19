import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarFileImport } from './CalendarFileImport';
import { academicApi } from './academic';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps an HTTP error out of the preview and allows retrying', async () => {
  vi.spyOn(academicApi, 'semesters').mockResolvedValue([{id:'semester',name:'Autumn',startDate:'2026-07-01',endDate:'2026-12-31',workingSaturdayRule:'SECOND_AND_FOURTH',campusId:'campus',status:'ACTIVE'}]);
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({message:'Calendar service unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}));
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CalendarFileImport campusId="campus" /></QueryClientProvider>);
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'),{target:{value:'semester'}});
  fireEvent.change(screen.getByLabelText('2. Upload calendar'),{target:{files:[new File(['date,title'],'calendar.csv')]}});
  fireEvent.click(screen.getByText('Read and verify calendar'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
  expect(screen.queryByText('Save calendar changes')).not.toBeInTheDocument();
  expect(screen.getByText('Read and verify calendar')).toBeEnabled();
});
it('requires verification and review, supports deleting extracted entries before saving', async () => {
  const entries = ['Holiday', 'Optional event'].map((title, i) => ({
    title,
    start: `2026-10-0${i + 2}`,
    end: `2026-10-0${i + 2}`,
    kind: 'HOLIDAY',
    teachingAllowed: false,
    examType: 'OTHER',
    evidence: 'October holiday',
    concern: '',
  }));
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const url = String(input);
      const value = url.includes('/semesters')
        ? [
            {
              id: 'semester',
              name: 'Autumn',
              startDate: '2026-07-01',
              endDate: '2026-12-31',
              workingSaturdayRule: 'SECOND_AND_FOURTH',
            },
          ]
        : url.endsWith('/commit')
          ? { saved: true, message: 'Saved calendar' }
          : {
              token: 'token',
              entries,
              warnings: [],
              verified: url.endsWith('/verify'),
            };
      return new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CalendarFileImport campusId="campus" />
    </QueryClientProvider>,
  );
  await screen.findByText(/Autumn/);
  fireEvent.change(screen.getByLabelText('1. Choose semester'), {
    target: { value: 'semester' },
  });
  fireEvent.change(screen.getByLabelText('2. Upload calendar'), {
    target: { files: [new File(['date,title'], 'calendar.csv')] },
  });
  fireEvent.click(screen.getByText('Read and verify calendar'));
  await screen.findByText(/Two AI passes completed/);
  const save = screen.getByText('Save calendar changes') as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getAllByText('Remove entry')[1]!);
  fireEvent.click(screen.getByLabelText(/I checked the source/));
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await screen.findByText('Saved calendar');
  const call = fetch.mock.calls.find(([url]) =>
    String(url).endsWith('/commit'),
  );
  expect(JSON.parse(String(call?.[1]?.body)).entries).toHaveLength(1);
  expect(
    fetch.mock.calls.some(([url]) => String(url).endsWith('/verify')),
  ).toBe(true);
});
