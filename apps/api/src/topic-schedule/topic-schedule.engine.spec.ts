import {
  calculateTopicSchedule,
  TeachingSession,
  TopicDemand,
} from './topic-schedule.engine';

const topics: TopicDemand[] = [
  demand('topic-a', 1, 1, 'Arrays', 90),
  demand('topic-b', 1, 2, 'Linked lists', 120),
  demand('topic-c', 2, 1, 'Stacks', 60),
];

describe('calculateTopicSchedule', () => {
  it('allocates topics across sessions and carries spare minutes forward', () => {
    const result = calculateTopicSchedule(topics, [
      session('one', '2026-07-01'),
      session('two', '2026-07-03'),
      session('three', '2026-07-08'),
      session('four', '2026-07-10'),
      session('five', '2026-07-15'),
    ]);

    expect(result.allocations).toEqual([
      expect.objectContaining({
        id: 'topic-a',
        plannedStartDate: '2026-07-01',
        plannedFinishDate: '2026-07-03',
        sessionIds: ['one', 'two'],
      }),
      expect.objectContaining({
        id: 'topic-b',
        plannedStartDate: '2026-07-03',
        plannedFinishDate: '2026-07-10',
        sessionIds: ['two', 'three', 'four'],
      }),
      expect.objectContaining({
        id: 'topic-c',
        plannedStartDate: '2026-07-10',
        plannedFinishDate: '2026-07-15',
        sessionIds: ['four', 'five'],
      }),
    ]);
    expect(result.summary).toEqual({
      requiredMinutes: 270,
      availableMinutes: 300,
      allocatedMinutes: 270,
      shortfallMinutes: 0,
      usableSessions: 5,
      excludedSessions: 0,
    });
  });

  it('shifts every affected later topic after a session is cancelled', () => {
    const result = calculateTopicSchedule(topics, [
      session('one', '2026-07-01'),
      session('two', '2026-07-03', 'CANCELLED'),
      session('three', '2026-07-08'),
      session('four', '2026-07-10'),
      session('five', '2026-07-15'),
    ]);

    expect(result.allocations).toEqual([
      expect.objectContaining({
        id: 'topic-a',
        plannedFinishDate: '2026-07-08',
      }),
      expect.objectContaining({
        id: 'topic-b',
        plannedStartDate: '2026-07-08',
        plannedFinishDate: '2026-07-15',
      }),
    ]);
    expect(result.unscheduledTopics).toEqual([
      expect.objectContaining({
        id: 'topic-c',
        allocatedMinutes: 30,
        remainingMinutes: 30,
      }),
    ]);
    expect(result.summary).toMatchObject({
      availableMinutes: 240,
      shortfallMinutes: 30,
      excludedSessions: 1,
    });
  });

  it('treats an absent holiday session as no capacity and shifts the plan', () => {
    const regular = calculateTopicSchedule(topics.slice(0, 2), [
      session('one', '2026-07-01'),
      session('holiday-slot', '2026-07-03'),
      session('three', '2026-07-08'),
      session('four', '2026-07-10'),
    ]);
    const holiday = calculateTopicSchedule(topics.slice(0, 2), [
      session('one', '2026-07-01'),
      session('three', '2026-07-08'),
      session('four', '2026-07-10'),
    ]);

    expect(regular.allocations[1]?.plannedFinishDate).toBe('2026-07-10');
    expect(holiday.allocations[0]?.plannedFinishDate).toBe('2026-07-08');
    expect(holiday.unscheduledTopics[0]).toMatchObject({
      id: 'topic-b',
      remainingMinutes: 30,
    });
  });

  it('orders unsorted inputs and excludes skipped and merged sessions', () => {
    const result = calculateTopicSchedule(
      [topics[1]!, topics[0]!],
      [
        session('merged', '2026-07-02', 'MERGED'),
        session('two', '2026-07-03'),
        session('one', '2026-07-01'),
        session('skipped', '2026-07-04', 'SKIPPED'),
        session('three', '2026-07-08'),
        session('four', '2026-07-10'),
      ],
    );

    expect(result.allocations.map((entry) => entry.id)).toEqual([
      'topic-a',
      'topic-b',
    ]);
    expect(result.summary.excludedSessions).toBe(2);
  });

  it('rejects invalid topic minutes and invalid session durations', () => {
    expect(() =>
      calculateTopicSchedule([demand('bad', 1, 1, 'Bad', 0)], []),
    ).toThrow('positive whole number');
    expect(() =>
      calculateTopicSchedule(topics, [
        {
          ...session('bad', '2026-07-01'),
          endsAt: new Date('2026-07-01T09:00:00.000Z'),
        },
      ]),
    ).toThrow('positive whole-minute');
  });
});

function demand(
  id: string,
  unitSequence: number,
  topicSequence: number,
  title: string,
  requiredMinutes: number,
): TopicDemand {
  return {
    id,
    unitSequence,
    topicSequence,
    unitTitle: `Unit ${unitSequence}`,
    title,
    requiredMinutes,
  };
}

function session(
  id: string,
  sessionDate: string,
  status = 'SCHEDULED',
): TeachingSession {
  return {
    id,
    sessionDate,
    startsAt: new Date(`${sessionDate}T09:00:00.000Z`),
    endsAt: new Date(`${sessionDate}T10:00:00.000Z`),
    status,
  };
}
