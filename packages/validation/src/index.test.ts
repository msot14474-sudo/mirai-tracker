import { describe, expect, it } from 'vitest';
import { sessionLogInputSchema } from './index';

describe('sessionLogInputSchema', () => {
  it('accepts a valid scheduled session log', () => {
    const result = sessionLogInputSchema.safeParse({
      scheduledSessionId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'IN_PROGRESS',
      completionPercentage: 50,
      covered: 'Linked-list insertion and deletion',
    });
    expect(result.success).toBe(true);
  });

  it('rejects percentages above 100', () => {
    const result = sessionLogInputSchema.safeParse({
      scheduledSessionId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'IN_PROGRESS',
      completionPercentage: 120,
      covered: 'Invalid example',
    });
    expect(result.success).toBe(false);
  });
});
