import { z } from 'zod';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/^[=+@]/.test(value), {
      message: 'Spreadsheet formulas are not allowed.',
    });

export const updateUnitSchema = z
  .object({
    title: safeText(200).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one unit field to update.',
  });

export const updateTopicSchema = z
  .object({
    title: safeText(240).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
    plannedMinutes: z.coerce.number().int().positive().max(10_080).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one topic field to update.',
  });

export const examScopeSchema = z.object({
  topicIds: z.array(uuidSchema).max(2_000),
});

export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
export type ExamScopeInput = z.infer<typeof examScopeSchema>;
