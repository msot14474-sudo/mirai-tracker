import { z } from 'zod';
export const lectureReviewSchema = z
  .object({
    understood: z.boolean(),
    unclearTopics: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.understood && !value.unclearTopics)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unclearTopics'],
        message: 'Tell us what you did not understand.',
      });
  });
export const lectureListSchema = z.object({
  review: z.enum(['pending', 'reviewed']).default('pending'),
  page: z.coerce.number().int().min(0).max(10000).default(0),
});
