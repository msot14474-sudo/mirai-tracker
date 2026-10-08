import { SessionLogStatus, WorkStatus } from '@prisma/client';
import { z } from 'zod';
import {
  isoDateSchema,
  uuidSchema,
} from '../academic-calendar/academic-calendar.schemas';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

export const sessionLogDateQuerySchema = z.object({
  date: isoDateSchema,
});

export const createSessionLogSchema = z
  .object({
    status: z.nativeEnum(SessionLogStatus),
    overallCompletionPercentage: z.coerce.number().min(0).max(100),
    coveredSummary: z.string().trim().min(1).max(4_000),
    leftOverSummary: optionalText(4_000),
    carryForwardTopicId: uuidSchema.nullable().optional(),
    classworkStatus: z.nativeEnum(WorkStatus),
    homeworkStatus: z.nativeEnum(WorkStatus),
    notes: optionalText(4_000),
    mergedIntoSessionId: uuidSchema.nullable().optional(),
    cancellationReason: optionalText(1_000),
    clientElapsedSeconds: z.number().nonnegative().max(3_600).optional(),
    topicUpdates: z
      .array(
        z.object({
          topicId: uuidSchema,
          completionAfterPercentage: z.coerce.number().min(0).max(100),
          minutesUsed: z.coerce
            .number()
            .int()
            .nonnegative()
            .max(720)
            .nullable()
            .optional(),
          notes: optionalText(2_000),
        }),
      )
      .max(50),
  })
  .superRefine((value, context) => {
    const topicIds = value.topicUpdates.map((update) => update.topicId);
    if (new Set(topicIds).size !== topicIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['topicUpdates'],
        message: 'Each topic can be updated only once in a session log.',
      });
    }
    const noTeaching = new Set<SessionLogStatus>([
      SessionLogStatus.SKIPPED,
      SessionLogStatus.MERGED,
      SessionLogStatus.CANCELLED,
    ]).has(value.status);
    if (noTeaching && value.topicUpdates.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['topicUpdates'],
        message: 'Skipped, merged and cancelled classes cannot advance topics.',
      });
    }
    if (
      value.status === SessionLogStatus.MERGED &&
      !value.mergedIntoSessionId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mergedIntoSessionId'],
        message: 'Choose the class this session was merged into.',
      });
    }
    if (value.status !== SessionLogStatus.MERGED && value.mergedIntoSessionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mergedIntoSessionId'],
        message: 'A merge target is allowed only for a merged class.',
      });
    }
    if (
      value.status === SessionLogStatus.CANCELLED &&
      !value.cancellationReason
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cancellationReason'],
        message: 'Give a reason when cancelling a class.',
      });
    }
  });

export type CreateSessionLogInput = z.infer<typeof createSessionLogSchema>;
