import { z } from 'zod';
import { isoDateSchema } from '../academic-calendar/academic-calendar.schemas';

export const reportTabs = [
  'course',
  'delivery',
  'faculty',
  'exams',
  'campus',
] as const;
export const reportQuerySchema = z
  .object({
    campusId: z.string().uuid().optional(),
    trackId: z.enum(['MIRAI', 'UNIVERSITY']).optional(),
    semesterId: z.string().uuid().optional(),
    batchId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    offeringId: z.string().uuid().optional(),
    facultyId: z.string().uuid().optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    deliveryStatus: z
      .enum([
        'TAUGHT',
        'ALL',
        'COMPLETED',
        'IN_PROGRESS',
        'SKIPPED',
        'MERGED',
        'CANCELLED',
      ])
      .default('TAUGHT'),
    tab: z.enum(reportTabs).default('course'),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'From date must be on or before To date.',
    path: ['to'],
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
