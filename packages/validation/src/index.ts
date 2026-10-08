import { z } from 'zod';

export const sessionStatusSchema = z.enum([
  'COMPLETED',
  'IN_PROGRESS',
  'SKIPPED',
  'MERGED',
  'CANCELLED',
]);

export const completionPercentageSchema = z.number().min(0).max(100);
export const plannedHoursSchema = z.number().finite().nonnegative();

export const sessionLogInputSchema = z.object({
  scheduledSessionId: z.string().uuid(),
  status: sessionStatusSchema,
  completionPercentage: completionPercentageSchema,
  covered: z.string().trim().max(2000),
  leftOver: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type SessionLogInput = z.infer<typeof sessionLogInputSchema>;
