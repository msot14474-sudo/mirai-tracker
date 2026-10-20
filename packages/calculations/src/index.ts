export type TopicProgressStatus =
  'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export type TopicProgress = {
  plannedHours: number;
  status: TopicProgressStatus;
  completionPercentage: number;
};

export type SubjectProgressTopic = {
  id: string;
  title: string;
  plannedMinutes: number;
  status: TopicProgressStatus;
  completionPercentage: number;
  plannedFinishDate?: string | null;
};

export type ProgressTeachingSession = {
  sessionDate: string;
  plannedMinutes: number;
  status: string;
};

export type ProgressThresholds = {
  onTrack: number;
  tight: number;
};

export type ProgressStatus = 'ON_TRACK' | 'TIGHT' | 'DANGER' | 'COMPLETE';

export type SubjectProgressInput = {
  asOfDate: string;
  targetFinishDate: string;
  topics: SubjectProgressTopic[];
  sessions: ProgressTeachingSession[];
  thresholds?: ProgressThresholds;
};

export type SubjectProgressCalculation = {
  asOfDate: string;
  targetFinishDate: string;
  hoursInScope: number;
  coveredHours: number;
  coveragePercentage: number;
  remainingHours: number;
  availableHours: number;
  plannedHoursByToday: number;
  paceVsPlanHours: number;
  bufferRatio: number | null;
  status: ProgressStatus;
  thresholds: ProgressThresholds;
  overdueTopicIds: string[];
  minutes: {
    hoursInScope: number;
    covered: number;
    remaining: number;
    available: number;
    plannedByToday: number;
    paceVsPlan: number;
  };
};

export type ProgressRollupItem = Pick<
  SubjectProgressCalculation,
  | 'hoursInScope'
  | 'coveredHours'
  | 'remainingHours'
  | 'availableHours'
  | 'plannedHoursByToday'
  | 'paceVsPlanHours'
  | 'status'
> & {
  overdueTopicIds?: string[];
};

export type ProgressRollup = {
  subjectCount: number;
  hoursInScope: number;
  coveredHours: number;
  coveragePercentage: number;
  remainingHours: number;
  availableHours: number;
  plannedHoursByToday: number;
  paceVsPlanHours: number;
  bufferRatio: number | null;
  status: ProgressStatus;
  overdueTopics: number;
  statusCounts: Record<ProgressStatus, number>;
};

export type ExamReadinessTopic = {
  id: string;
  title: string;
  plannedMinutes: number;
  status: TopicProgressStatus;
  completionPercentage: number;
};

export type ExamReadinessCalculation = {
  topicsInScope: number;
  completedTopics: number;
  plannedHours: number;
  coveredHours: number;
  coveragePercentage: number | null;
  hoursStillNeeded: number;
  minutes: {
    planned: number;
    covered: number;
    stillNeeded: number;
  };
};

const capacityStatuses = new Set(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED']);
const defaultThresholds: ProgressThresholds = { onTrack: 1.15, tight: 1 };

function assertTopic(topic: TopicProgress): void {
  if (!Number.isFinite(topic.plannedHours) || topic.plannedHours < 0) {
    throw new RangeError('Planned hours must be a non-negative finite number.');
  }
  assertPercentage(topic.completionPercentage);
}

function assertPercentage(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError('Completion percentage must be between 0 and 100.');
  }
}

export function calculateHoursInScope(topics: TopicProgress[]): number {
  return topics.reduce((total, topic) => {
    assertTopic(topic);
    return topic.status === 'SKIPPED' ? total : total + topic.plannedHours;
  }, 0);
}

export function calculateCoveredHours(topics: TopicProgress[]): number {
  return topics.reduce((total, topic) => {
    assertTopic(topic);
    if (topic.status === 'COMPLETED') return total + topic.plannedHours;
    if (topic.status === 'IN_PROGRESS') {
      return total + topic.plannedHours * (topic.completionPercentage / 100);
    }
    return total;
  }, 0);
}

/**
 * Implements the MSOT definitions using minutes internally so differently
 * sized classes remain hour-weighted. Today is treated as the end of the
 * reporting day: its capacity is part of plan-to-date, while available hours
 * begin with the next teaching day and include the target finish date.
 */
export function calculateSubjectProgress(
  input: SubjectProgressInput,
): SubjectProgressCalculation {
  assertIsoDate(input.asOfDate, 'As-of date');
  assertIsoDate(input.targetFinishDate, 'Target finish date');
  const thresholds = input.thresholds ?? defaultThresholds;
  assertThresholds(thresholds);

  const topics = input.topics.map((topic) => {
    if (!Number.isInteger(topic.plannedMinutes) || topic.plannedMinutes <= 0) {
      throw new RangeError(
        'Every topic must have positive whole-number planned minutes.',
      );
    }
    assertPercentage(topic.completionPercentage);
    if (topic.plannedFinishDate) {
      assertIsoDate(topic.plannedFinishDate, 'Planned finish date');
    }
    return topic;
  });

  const sessions = input.sessions.map((session) => {
    assertIsoDate(session.sessionDate, 'Session date');
    if (
      !Number.isInteger(session.plannedMinutes) ||
      session.plannedMinutes <= 0
    ) {
      throw new RangeError(
        'Every teaching session must have positive whole-number planned minutes.',
      );
    }
    return session;
  });

  const hoursInScopeMinutes = topics.reduce(
    (total, topic) =>
      topic.status === 'SKIPPED' ? total : total + topic.plannedMinutes,
    0,
  );
  const coveredMinutes = topics.reduce((total, topic) => {
    if (topic.status === 'COMPLETED') return total + topic.plannedMinutes;
    if (topic.status === 'IN_PROGRESS') {
      return total + topic.plannedMinutes * (topic.completionPercentage / 100);
    }
    return total;
  }, 0);
  const remainingMinutes = Math.max(hoursInScopeMinutes - coveredMinutes, 0);
  const planCutoff =
    input.asOfDate < input.targetFinishDate
      ? input.asOfDate
      : input.targetFinishDate;
  const plannedByTodayMinutes = Math.min(
    sessions.reduce(
      (total, session) =>
        capacityStatuses.has(session.status) &&
        session.sessionDate <= planCutoff
          ? total + session.plannedMinutes
          : total,
      0,
    ),
    hoursInScopeMinutes,
  );
  const availableMinutes = sessions.reduce(
    (total, session) =>
      capacityStatuses.has(session.status) &&
      session.sessionDate > input.asOfDate &&
      session.sessionDate <= input.targetFinishDate
        ? total + session.plannedMinutes
        : total,
    0,
  );
  const paceMinutes = coveredMinutes - plannedByTodayMinutes;
  const rawBufferRatio =
    remainingMinutes === 0 ? null : availableMinutes / remainingMinutes;
  const status: ProgressStatus =
    remainingMinutes === 0
      ? 'COMPLETE'
      : rawBufferRatio !== null && rawBufferRatio >= thresholds.onTrack
        ? 'ON_TRACK'
        : rawBufferRatio !== null && rawBufferRatio >= thresholds.tight
          ? 'TIGHT'
          : 'DANGER';
  const coveragePercentage =
    hoursInScopeMinutes === 0
      ? 100
      : (coveredMinutes / hoursInScopeMinutes) * 100;
  const overdueTopicIds = topics
    .filter(
      (topic) =>
        topic.status !== 'COMPLETED' &&
        topic.status !== 'SKIPPED' &&
        Boolean(
          topic.plannedFinishDate && topic.plannedFinishDate < input.asOfDate,
        ),
    )
    .map((topic) => topic.id);

  return {
    asOfDate: input.asOfDate,
    targetFinishDate: input.targetFinishDate,
    hoursInScope: minutesToHours(hoursInScopeMinutes),
    coveredHours: minutesToHours(coveredMinutes),
    coveragePercentage: round(coveragePercentage, 2),
    remainingHours: minutesToHours(remainingMinutes),
    availableHours: minutesToHours(availableMinutes),
    plannedHoursByToday: minutesToHours(plannedByTodayMinutes),
    paceVsPlanHours: minutesToHours(paceMinutes),
    bufferRatio: rawBufferRatio === null ? null : round(rawBufferRatio, 2),
    status,
    thresholds: { ...thresholds },
    overdueTopicIds,
    minutes: {
      hoursInScope: round(hoursInScopeMinutes, 2),
      covered: round(coveredMinutes, 2),
      remaining: round(remainingMinutes, 2),
      available: round(availableMinutes, 2),
      plannedByToday: round(plannedByTodayMinutes, 2),
      paceVsPlan: round(paceMinutes, 2),
    },
  };
}

/**
 * Adds hour-based metrics before rounding and deliberately takes the worst
 * subject status. A healthy large subject therefore cannot hide a smaller
 * subject that needs attention.
 */
export function rollUpProgress(items: ProgressRollupItem[]): ProgressRollup {
  if (items.length === 0) {
    throw new RangeError('A progress roll-up needs at least one subject.');
  }

  const statusCounts: Record<ProgressStatus, number> = {
    ON_TRACK: 0,
    TIGHT: 0,
    DANGER: 0,
    COMPLETE: 0,
  };
  const totals = items.reduce(
    (result, item) => {
      for (const [label, value] of Object.entries({
        'Hours in scope': item.hoursInScope,
        'Covered hours': item.coveredHours,
        'Remaining hours': item.remainingHours,
        'Available hours': item.availableHours,
        'Planned hours by today': item.plannedHoursByToday,
      })) {
        if (!Number.isFinite(value) || value < 0) {
          throw new RangeError(
            `${label} must be a non-negative finite number.`,
          );
        }
      }
      if (!Number.isFinite(item.paceVsPlanHours)) {
        throw new RangeError('Pace versus plan must be a finite number.');
      }

      statusCounts[item.status] += 1;
      result.hoursInScope += item.hoursInScope;
      result.coveredHours += item.coveredHours;
      result.remainingHours += item.remainingHours;
      result.availableHours += item.availableHours;
      result.plannedHoursByToday += item.plannedHoursByToday;
      result.paceVsPlanHours += item.paceVsPlanHours;
      result.overdueTopics += item.overdueTopicIds?.length ?? 0;
      return result;
    },
    {
      hoursInScope: 0,
      coveredHours: 0,
      remainingHours: 0,
      availableHours: 0,
      plannedHoursByToday: 0,
      paceVsPlanHours: 0,
      overdueTopics: 0,
    },
  );

  const status: ProgressStatus = statusCounts.DANGER
    ? 'DANGER'
    : statusCounts.TIGHT
      ? 'TIGHT'
      : statusCounts.ON_TRACK
        ? 'ON_TRACK'
        : 'COMPLETE';
  const coveragePercentage =
    totals.hoursInScope === 0
      ? 100
      : (totals.coveredHours / totals.hoursInScope) * 100;
  const bufferRatio =
    totals.remainingHours === 0
      ? null
      : totals.availableHours / totals.remainingHours;

  return {
    subjectCount: items.length,
    hoursInScope: round(totals.hoursInScope, 2),
    coveredHours: round(totals.coveredHours, 2),
    coveragePercentage: round(coveragePercentage, 2),
    remainingHours: round(totals.remainingHours, 2),
    availableHours: round(totals.availableHours, 2),
    plannedHoursByToday: round(totals.plannedHoursByToday, 2),
    paceVsPlanHours: round(totals.paceVsPlanHours, 2),
    bufferRatio: bufferRatio === null ? null : round(bufferRatio, 2),
    status,
    overdueTopics: totals.overdueTopics,
    statusCounts,
  };
}

/**
 * Calculates exam readiness from topics already filtered to one exam scope.
 * It follows the official hour-weighted coverage rule and excludes skipped
 * topics from both the numerator and denominator.
 */
export function calculateExamReadiness(
  topics: ExamReadinessTopic[],
): ExamReadinessCalculation {
  const inScope = topics.filter((topic) => {
    if (!Number.isInteger(topic.plannedMinutes) || topic.plannedMinutes <= 0) {
      throw new RangeError(
        'Every exam-scope topic must have positive whole-number planned minutes.',
      );
    }
    assertPercentage(topic.completionPercentage);
    return topic.status !== 'SKIPPED';
  });
  const plannedMinutes = inScope.reduce(
    (total, topic) => total + topic.plannedMinutes,
    0,
  );
  const coveredMinutes = inScope.reduce((total, topic) => {
    if (topic.status === 'COMPLETED') return total + topic.plannedMinutes;
    if (topic.status === 'IN_PROGRESS') {
      return total + topic.plannedMinutes * (topic.completionPercentage / 100);
    }
    return total;
  }, 0);
  const stillNeededMinutes = Math.max(plannedMinutes - coveredMinutes, 0);

  return {
    topicsInScope: inScope.length,
    completedTopics: inScope.filter((topic) => topic.status === 'COMPLETED')
      .length,
    plannedHours: minutesToHours(plannedMinutes),
    coveredHours: minutesToHours(coveredMinutes),
    coveragePercentage:
      plannedMinutes === 0
        ? null
        : round((coveredMinutes / plannedMinutes) * 100, 2),
    hoursStillNeeded: minutesToHours(stillNeededMinutes),
    minutes: {
      planned: round(plannedMinutes, 2),
      covered: round(coveredMinutes, 2),
      stillNeeded: round(stillNeededMinutes, 2),
    },
  };
}

function assertThresholds(thresholds: ProgressThresholds) {
  if (
    !Number.isFinite(thresholds.onTrack) ||
    !Number.isFinite(thresholds.tight) ||
    thresholds.tight <= 0 ||
    thresholds.onTrack < thresholds.tight
  ) {
    throw new RangeError(
      'Progress thresholds must be positive and ON TRACK must be at least TIGHT.',
    );
  }
}

function assertIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(`${label} must be a real calendar date.`);
  }
}

function minutesToHours(minutes: number) {
  return round(minutes / 60, 2);
}

function round(value: number, digits: number) {
  const multiplier = 10 ** digits;
  const result = Math.round((value + Number.EPSILON) * multiplier) / multiplier;
  return Object.is(result, -0) ? 0 : result;
}

export * from './tracks';
