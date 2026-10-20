import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampusAnalytics, campusMetrics, type CampusSnapshot } from './CampusAnalytics';

afterEach(cleanup);

const subject = {
  id: 'a',
  code: 'CS',
  name: 'Computing',
  batch: 'A',
  completion: 50,
  plannedMinutes: 120,
  plan: { status: 'ACTIVE' },
  topics: [
    { minutes: 60, completion: 100, status: 'COMPLETED' },
    { minutes: 60, completion: 0, status: 'NOT_STARTED' },
  ],
  sessions: [
    { status: 'COMPLETED', count: 2 },
    { status: 'CANCELLED', count: 1 },
  ],
  exams: [{ scopeTopics: 2, incompleteTopics: 1 }],
};
it('weights campus coverage by topic minutes and keeps exam categories disjoint', () => {
  const data = {
    subjects: [
      subject,
      {
        ...subject,
        id: 'b',
        topics: [{ minutes: 240, completion: 0, status: 'NOT_STARTED' }],
        exams: [{ scopeTopics: 0, incompleteTopics: 0 }],
      },
    ],
  } as CampusSnapshot;
  const result = campusMetrics(data);
  expect(result.progress).toBe(17);
  expect(result.exams.map((s) => s.value)).toEqual([0, 1, 1, 0]);
  expect(result.topics.reduce((n, s) => n + s.value, 0)).toBe(3);
});
it('does not invent progress for an empty campus', () => {
  const result = campusMetrics({ subjects: [] } as unknown as CampusSnapshot);
  expect(result.progress).toBeNull();
  expect(result.lectures.every((s) => s.value === 0)).toBe(true);
});

it('excludes skipped hours and honors completed topics consistently with subject progress', () => {
  const result = campusMetrics({
    subjects: [
      {
        ...subject,
        topics: [
          { minutes: 60, completion: 0, status: 'COMPLETED' },
          { minutes: 60, completion: 0, status: 'NOT_STARTED' },
          { minutes: 600, completion: 0, status: 'SKIPPED' },
        ],
      },
      { ...subject, id: 'no-plan', plan: null, topics: [] },
    ],
  } as CampusSnapshot);
  expect(result.progress).toBe(50);
  expect(result.measuredSubjects).toBe(1);
  expect(result.topics.map((t) => t.value)).toEqual([1, 0, 1, 1]);
});

it('distinguishes timetable counts from saved logs and shows missing plan coverage', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(['ai-insights', 'campus', ''], {
    generatedAt: '2026-10-20T10:00:00Z',
    summary: { subjects: 2, attention: 2, overdueTopics: 1, missingLogs: 44, needsHelp: 0, reviews: 0 },
    coverage: { pastLectures: 44, upcomingLectures: 26, loggedLectures: 0 },
    subjects: [
      { ...subject, completion: 0, topics: [{ minutes: 60, completion: 0, status: 'NOT_STARTED' }], sessions: [{ status: 'SCHEDULED', count: 35 }] },
      { ...subject, id: 'no-plan', name: 'No plan', completion: null, plan: null, topics: [], sessions: [{ status: 'SCHEDULED', count: 35 }] },
    ],
  });
  render(
    <QueryClientProvider client={client}>
      <CampusAnalytics campusId="campus" name="Admin" />
    </QueryClientProvider>,
  );
  expect(screen.getByText('0 classes have saved lecture logs')).toBeInTheDocument();
  expect(screen.getByText('Unlogged past classes').parentElement).toHaveTextContent('44');
  expect(screen.getByText('Upcoming classes').parentElement).toHaveTextContent('26');
  expect(screen.getByText('Plan hours available for 1 of 2 subjects')).toBeInTheDocument();
  expect(screen.getByText('Coverage unknown')).toBeInTheDocument();
  expect(screen.getByText(/missing logs do not confirm missed teaching/)).toBeInTheDocument();
  client.clear();
});
