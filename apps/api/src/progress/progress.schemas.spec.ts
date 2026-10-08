import { progressDateQuerySchema } from './progress.schemas';

describe('M10 progress request validation', () => {
  it('accepts a real as-of date', () => {
    expect(progressDateQuerySchema.parse({ asOf: '2026-10-08' })).toEqual({
      asOf: '2026-10-08',
    });
  });

  it('rejects missing and impossible dates', () => {
    expect(progressDateQuerySchema.safeParse({}).success).toBe(false);
    expect(
      progressDateQuerySchema.safeParse({ asOf: '2026-02-30' }).success,
    ).toBe(false);
  });
});
