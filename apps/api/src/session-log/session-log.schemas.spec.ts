import { SessionLogStatus, WorkStatus } from '@prisma/client';
import { createSessionLogSchema } from './session-log.schemas';

const base = {
  status: SessionLogStatus.COMPLETED,
  overallCompletionPercentage: 100,
  coveredSummary: 'Arrays',
  classworkStatus: WorkStatus.NOT_ASSIGNED,
  homeworkStatus: WorkStatus.NOT_ASSIGNED,
  topicUpdates: [
    {
      topicId: 'eb4897e7-e287-4757-9fac-95ee65b49af7',
      completionAfterPercentage: 50,
      minutesUsed: 60,
    },
  ],
};

describe('createSessionLogSchema', () => {
  it('accepts the complete teaching-session payload', () => {
    expect(createSessionLogSchema.parse(base)).toMatchObject(base);
  });

  it('prevents non-teaching statuses from advancing topics', () => {
    const result = createSessionLogSchema.safeParse({
      ...base,
      status: SessionLogStatus.SKIPPED,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('cannot advance');
    }
  });

  it('requires a merge target and a cancellation reason', () => {
    expect(
      createSessionLogSchema.safeParse({
        ...base,
        status: SessionLogStatus.MERGED,
        topicUpdates: [],
      }).success,
    ).toBe(false);
    expect(
      createSessionLogSchema.safeParse({
        ...base,
        status: SessionLogStatus.CANCELLED,
        topicUpdates: [],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate topic updates', () => {
    const result = createSessionLogSchema.safeParse({
      ...base,
      topicUpdates: [base.topicUpdates[0], base.topicUpdates[0]],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('only once');
    }
  });
});
