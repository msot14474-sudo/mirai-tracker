const usableStatuses = new Set(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED']);

export type TopicDemand = {
  id: string;
  unitSequence: number;
  topicSequence: number;
  unitTitle: string;
  title: string;
  requiredMinutes: number;
};

export type TeachingSession = {
  id: string;
  sessionDate: Date | string;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

export type TopicAllocation = TopicDemand & {
  plannedStartDate: string;
  plannedFinishDate: string;
  allocatedMinutes: number;
  sessionIds: string[];
};

export type UnscheduledTopic = TopicDemand & {
  allocatedMinutes: number;
  remainingMinutes: number;
};

export type TopicScheduleCalculation = {
  allocations: TopicAllocation[];
  unscheduledTopics: UnscheduledTopic[];
  summary: {
    requiredMinutes: number;
    availableMinutes: number;
    allocatedMinutes: number;
    shortfallMinutes: number;
    usableSessions: number;
    excludedSessions: number;
  };
};

/**
 * Allocates ordered topic minutes into ordered teaching sessions. A topic may
 * span sessions and unused minutes in a session flow directly to the next
 * topic. Cancelled, skipped and merged sessions provide no teaching capacity.
 */
export function calculateTopicSchedule(
  topics: TopicDemand[],
  sessions: TeachingSession[],
): TopicScheduleCalculation {
  const orderedTopics = [...topics].sort(
    (left, right) =>
      left.unitSequence - right.unitSequence ||
      left.topicSequence - right.topicSequence,
  );
  for (const topic of orderedTopics) {
    if (
      !Number.isInteger(topic.requiredMinutes) ||
      topic.requiredMinutes <= 0
    ) {
      throw new RangeError(
        'Every topic must require a positive whole number of minutes.',
      );
    }
  }

  const usable = sessions
    .filter((session) => usableStatuses.has(session.status))
    .map((session) => ({
      ...session,
      capacityMinutes: durationMinutes(session.startsAt, session.endsAt),
    }))
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  const requiredMinutes = orderedTopics.reduce(
    (total, topic) => total + topic.requiredMinutes,
    0,
  );
  const availableMinutes = usable.reduce(
    (total, session) => total + session.capacityMinutes,
    0,
  );

  const allocations: TopicAllocation[] = [];
  const unscheduledTopics: UnscheduledTopic[] = [];
  let sessionIndex = 0;
  let remainingInSession = usable[0]?.capacityMinutes ?? 0;
  let allocatedMinutes = 0;

  for (const topic of orderedTopics) {
    let remaining = topic.requiredMinutes;
    const sessionIds: string[] = [];
    let plannedStartDate: string | null = null;
    let plannedFinishDate: string | null = null;

    while (remaining > 0 && sessionIndex < usable.length) {
      const session = usable[sessionIndex];
      if (!session) break;
      if (remainingInSession === 0) {
        sessionIndex += 1;
        remainingInSession = usable[sessionIndex]?.capacityMinutes ?? 0;
        continue;
      }

      const amount = Math.min(remaining, remainingInSession);
      const sessionDate = isoDate(session.sessionDate);
      plannedStartDate ??= sessionDate;
      plannedFinishDate = sessionDate;
      if (sessionIds.at(-1) !== session.id) sessionIds.push(session.id);
      remaining -= amount;
      remainingInSession -= amount;
      allocatedMinutes += amount;
    }

    const allocatedToTopic = topic.requiredMinutes - remaining;
    if (remaining === 0 && plannedStartDate && plannedFinishDate) {
      allocations.push({
        ...topic,
        plannedStartDate,
        plannedFinishDate,
        allocatedMinutes: allocatedToTopic,
        sessionIds,
      });
    } else {
      unscheduledTopics.push({
        ...topic,
        allocatedMinutes: allocatedToTopic,
        remainingMinutes: remaining,
      });
    }
  }

  return {
    allocations,
    unscheduledTopics,
    summary: {
      requiredMinutes,
      availableMinutes,
      allocatedMinutes,
      shortfallMinutes: Math.max(requiredMinutes - availableMinutes, 0),
      usableSessions: usable.length,
      excludedSessions: sessions.length - usable.length,
    },
  };
}

function durationMinutes(startsAt: Date, endsAt: Date) {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new RangeError(
      'Every teaching session must have a positive whole-minute duration.',
    );
  }
  return minutes;
}

function isoDate(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  if (!match) throw new RangeError('Session dates must use YYYY-MM-DD.');
  return match[0];
}
