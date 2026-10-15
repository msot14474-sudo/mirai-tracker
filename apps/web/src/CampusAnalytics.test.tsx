import { expect, it } from 'vitest';
import { campusMetrics, type CampusSnapshot } from './CampusAnalytics';

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
