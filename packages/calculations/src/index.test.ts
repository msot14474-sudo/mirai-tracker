import { describe, expect, it } from 'vitest';
import {
  calculateCoveredHours,
  calculateExamReadiness,
  calculateHoursInScope,
  calculateSubjectProgress,
  rollUpProgress,
  SubjectProgressInput,
} from './index';

const topics = [
  { plannedHours: 2, status: 'COMPLETED' as const, completionPercentage: 100 },
  { plannedHours: 3, status: 'IN_PROGRESS' as const, completionPercentage: 50 },
  { plannedHours: 1, status: 'NOT_STARTED' as const, completionPercentage: 0 },
  { plannedHours: 4, status: 'SKIPPED' as const, completionPercentage: 0 },
];

describe('MSOT hour-weighted calculations', () => {
  it('excludes skipped topics from hours in scope', () => {
    expect(calculateHoursInScope(topics)).toBe(6);
  });

  it('counts completed hours fully and in-progress hours by percentage', () => {
    expect(calculateCoveredHours(topics)).toBe(3.5);
  });

  it('rejects invalid completion percentages', () => {
    expect(() =>
      calculateCoveredHours([
        { plannedHours: 1, status: 'IN_PROGRESS', completionPercentage: 101 },
      ]),
    ).toThrow(RangeError);
  });
});

describe('M11 progress roll-ups', () => {
  it('uses the worst subject status even when the aggregate buffer is healthy', () => {
    const result = rollUpProgress([
      progressItem({
        hoursInScope: 90,
        coveredHours: 80,
        remainingHours: 10,
        availableHours: 30,
        status: 'ON_TRACK',
      }),
      progressItem({
        hoursInScope: 10,
        coveredHours: 5,
        remainingHours: 5,
        availableHours: 2,
        status: 'DANGER',
      }),
    ]);

    expect(result).toMatchObject({
      bufferRatio: 2.13,
      status: 'DANGER',
      subjectCount: 2,
      statusCounts: { ON_TRACK: 1, DANGER: 1 },
    });
  });

  it('calculates coverage from total hours instead of averaging percentages', () => {
    const result = rollUpProgress([
      progressItem({ hoursInScope: 9, coveredHours: 3 }),
      progressItem({ hoursInScope: 1, coveredHours: 1 }),
    ]);

    expect(result.coveragePercentage).toBe(40);
    expect(result.coveredHours).toBe(4);
    expect(result.hoursInScope).toBe(10);
  });

  it('returns COMPLETE and no buffer ratio when every subject is complete', () => {
    expect(
      rollUpProgress([
        progressItem({
          hoursInScope: 4,
          coveredHours: 4,
          remainingHours: 0,
          availableHours: 0,
          status: 'COMPLETE',
        }),
      ]),
    ).toMatchObject({
      status: 'COMPLETE',
      coveragePercentage: 100,
      bufferRatio: null,
    });
  });

  it('rejects empty roll-ups and invalid metrics', () => {
    expect(() => rollUpProgress([])).toThrow('at least one subject');
    expect(() =>
      rollUpProgress([progressItem({ availableHours: -1 })]),
    ).toThrow('Available hours');
  });
});

describe('M12 exam readiness', () => {
  it('matches the mid-term scoped coverage and hours needed', () => {
    expect(
      calculateExamReadiness([
        examTopic('arrays', 120, 'COMPLETED', 100),
        examTopic('lists', 180, 'IN_PROGRESS', 50),
      ]),
    ).toMatchObject({
      topicsInScope: 2,
      completedTopics: 1,
      plannedHours: 5,
      coveredHours: 3.5,
      coveragePercentage: 70,
      hoursStillNeeded: 1.5,
    });
  });

  it('matches the wider end-term scope independently', () => {
    expect(
      calculateExamReadiness([
        examTopic('arrays', 120, 'COMPLETED', 100),
        examTopic('lists', 180, 'IN_PROGRESS', 50),
        examTopic('queues', 60, 'NOT_STARTED', 0),
      ]),
    ).toMatchObject({
      topicsInScope: 3,
      plannedHours: 6,
      coveredHours: 3.5,
      coveragePercentage: 58.33,
      hoursStillNeeded: 2.5,
    });
  });

  it('excludes skipped topics and reports an unmapped scope clearly', () => {
    expect(
      calculateExamReadiness([
        examTopic('skipped', 120, 'SKIPPED', 0),
        examTopic('done', 60, 'COMPLETED', 100),
      ]),
    ).toMatchObject({
      topicsInScope: 1,
      plannedHours: 1,
      coveragePercentage: 100,
      hoursStillNeeded: 0,
    });
    expect(calculateExamReadiness([])).toMatchObject({
      topicsInScope: 0,
      coveragePercentage: null,
      hoursStillNeeded: 0,
    });
  });

  it('rejects invalid planned minutes and percentages', () => {
    expect(() =>
      calculateExamReadiness([examTopic('bad', 0, 'NOT_STARTED', 0)]),
    ).toThrow('positive whole-number');
    expect(() =>
      calculateExamReadiness([examTopic('bad', 60, 'IN_PROGRESS', 101)]),
    ).toThrow('between 0 and 100');
  });
});

describe('M10 subject progress calculation', () => {
  it.each([
    {
      name: 'CS-DSA is ON TRACK',
      input: example({
        topics: [
          topic('a', 120, 'COMPLETED', 100, '2026-09-01'),
          topic('b', 180, 'IN_PROGRESS', 50, '2026-10-01'),
          topic('c', 60, 'NOT_STARTED', 0, '2026-11-01'),
        ],
        pastSessionMinutes: [60, 60, 60, 60],
        futureSessionMinutes: [60, 60, 60],
      }),
      expected: {
        hoursInScope: 6,
        coveredHours: 3.5,
        coveragePercentage: 58.33,
        remainingHours: 2.5,
        availableHours: 3,
        plannedHoursByToday: 4,
        paceVsPlanHours: -0.5,
        bufferRatio: 1.2,
        status: 'ON_TRACK',
        overdueTopicIds: ['b'],
      },
    },
    {
      name: 'MATH-101 is TIGHT',
      input: example({
        topics: [
          topic('a', 90, 'COMPLETED', 100, '2026-09-01'),
          topic('b', 150, 'IN_PROGRESS', 40, '2026-10-20'),
          topic('c', 120, 'NOT_STARTED', 0, '2026-11-10'),
        ],
        pastSessionMinutes: [90, 90],
        futureSessionMinutes: [75, 75, 75],
      }),
      expected: {
        hoursInScope: 6,
        coveredHours: 2.5,
        coveragePercentage: 41.67,
        remainingHours: 3.5,
        availableHours: 3.75,
        plannedHoursByToday: 3,
        paceVsPlanHours: -0.5,
        bufferRatio: 1.07,
        status: 'TIGHT',
        overdueTopicIds: [],
      },
    },
    {
      name: 'PHY-201 is DANGER and excludes a skipped topic',
      input: example({
        topics: [
          topic('a', 120, 'COMPLETED', 100, '2026-09-01'),
          topic('b', 180, 'IN_PROGRESS', 50, '2026-10-01'),
          topic('c', 240, 'NOT_STARTED', 0, '2026-11-15'),
          topic('d', 60, 'SKIPPED', 0, '2026-09-15'),
        ],
        pastSessionMinutes: [90, 90, 90],
        futureSessionMinutes: [120, 120],
      }),
      expected: {
        hoursInScope: 9,
        coveredHours: 3.5,
        coveragePercentage: 38.89,
        remainingHours: 5.5,
        availableHours: 4,
        plannedHoursByToday: 4.5,
        paceVsPlanHours: -1,
        bufferRatio: 0.73,
        status: 'DANGER',
        overdueTopicIds: ['b'],
      },
    },
  ])(
    'matches the hand calculation for $name to two decimals',
    ({ input, expected }) => {
      expect(calculateSubjectProgress(input)).toMatchObject(expected);
    },
  );

  it('returns COMPLETE with no ratio once every in-scope topic is covered', () => {
    const result = calculateSubjectProgress(
      example({
        topics: [topic('done', 120, 'COMPLETED', 100, '2026-09-01')],
        pastSessionMinutes: [120],
        futureSessionMinutes: [],
      }),
    );

    expect(result).toMatchObject({
      coveragePercentage: 100,
      remainingHours: 0,
      bufferRatio: null,
      status: 'COMPLETE',
    });
  });

  it('excludes cancelled, skipped and merged sessions from capacity', () => {
    const input = example({
      topics: [topic('a', 240, 'IN_PROGRESS', 25, '2026-11-01')],
      pastSessionMinutes: [60],
      futureSessionMinutes: [60],
    });
    input.sessions.push(
      { sessionDate: '2026-10-15', plannedMinutes: 60, status: 'CANCELLED' },
      { sessionDate: '2026-10-16', plannedMinutes: 60, status: 'SKIPPED' },
      { sessionDate: '2026-10-17', plannedMinutes: 60, status: 'MERGED' },
    );

    expect(calculateSubjectProgress(input)).toMatchObject({
      availableHours: 1,
      plannedHoursByToday: 1,
      status: 'DANGER',
    });
  });

  it('uses configurable thresholds at their exact boundaries', () => {
    const result = calculateSubjectProgress({
      ...example({
        topics: [topic('a', 120, 'NOT_STARTED', 0, '2026-11-01')],
        pastSessionMinutes: [],
        futureSessionMinutes: [60, 60],
      }),
      thresholds: { onTrack: 1, tight: 0.8 },
    });

    expect(result.bufferRatio).toBe(1);
    expect(result.status).toBe('ON_TRACK');
  });

  it.each([
    [1149, 'TIGHT'],
    [1150, 'ON_TRACK'],
    [1000, 'TIGHT'],
    [999, 'DANGER'],
    [0, 'DANGER'],
  ])('classifies %i available minutes against 1000 remaining without rounding the status', (available, status) => {
    const result = calculateSubjectProgress(example({
      topics: [topic('buffer', 1000, 'NOT_STARTED', 0, '2026-11-01')],
      pastSessionMinutes: [],
      futureSessionMinutes: available ? [available] : [],
    }));
    expect(result.status).toBe(status);
  });

  it('rejects invalid dates, durations and thresholds', () => {
    expect(() =>
      calculateSubjectProgress({
        ...example({
          topics: [],
          pastSessionMinutes: [],
          futureSessionMinutes: [],
        }),
        asOfDate: '2026-02-30',
      }),
    ).toThrow('real calendar date');
    expect(() =>
      calculateSubjectProgress({
        ...example({
          topics: [],
          pastSessionMinutes: [],
          futureSessionMinutes: [],
        }),
        thresholds: { onTrack: 0.9, tight: 1 },
      }),
    ).toThrow('thresholds');
  });
});

function topic(
  id: string,
  plannedMinutes: number,
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED',
  completionPercentage: number,
  plannedFinishDate: string,
) {
  return {
    id,
    title: `Topic ${id}`,
    plannedMinutes,
    status,
    completionPercentage,
    plannedFinishDate,
  };
}

function example({
  topics: progressTopics,
  pastSessionMinutes,
  futureSessionMinutes,
}: {
  topics: SubjectProgressInput['topics'];
  pastSessionMinutes: number[];
  futureSessionMinutes: number[];
}): SubjectProgressInput {
  return {
    asOfDate: '2026-10-08',
    targetFinishDate: '2026-11-30',
    topics: progressTopics,
    sessions: [
      ...pastSessionMinutes.map((plannedMinutes, index) => ({
        sessionDate: `2026-10-0${index + 1}`,
        plannedMinutes,
        status: 'COMPLETED',
      })),
      ...futureSessionMinutes.map((plannedMinutes, index) => ({
        sessionDate: `2026-10-${String(index + 12).padStart(2, '0')}`,
        plannedMinutes,
        status: 'SCHEDULED',
      })),
    ],
  };
}

function progressItem(
  overrides: Partial<Parameters<typeof rollUpProgress>[0][number]> = {},
): Parameters<typeof rollUpProgress>[0][number] {
  return {
    hoursInScope: 6,
    coveredHours: 3,
    remainingHours: 3,
    availableHours: 4,
    plannedHoursByToday: 3.5,
    paceVsPlanHours: -0.5,
    status: 'ON_TRACK',
    overdueTopicIds: [],
    ...overrides,
  };
}

function examTopic(
  id: string,
  plannedMinutes: number,
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED',
  completionPercentage: number,
) {
  return {
    id,
    title: `Topic ${id}`,
    plannedMinutes,
    status,
    completionPercentage,
  };
}
