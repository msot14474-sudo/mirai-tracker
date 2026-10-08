import { ScheduleCalculationReason } from '@prisma/client';
import { z } from 'zod';

export const calculateTopicScheduleSchema = z.object({
  reason: z.nativeEnum(ScheduleCalculationReason).optional(),
});

export const setSessionCancellationSchema = z
  .object({
    cancelled: z.boolean(),
    reason: z.string().trim().max(1_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.cancelled && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Give a reason when cancelling a class.',
      });
    }
  });

export type CalculateTopicScheduleInput = z.infer<
  typeof calculateTopicScheduleSchema
>;
export type SetSessionCancellationInput = z.infer<
  typeof setSessionCancellationSchema
>;
