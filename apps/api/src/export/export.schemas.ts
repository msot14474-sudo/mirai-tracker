import { ExportType } from '@prisma/client';
import { z } from 'zod';
import { isoDateSchema } from '../academic-calendar/academic-calendar.schemas';

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM.');

export const exportRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(ExportType.FULL_DATA) }),
  z.object({
    type: z.literal(ExportType.CAMPUS_PROGRESS),
    asOf: isoDateSchema,
  }),
  z.object({
    type: z.literal(ExportType.SUBJECT_PROGRESS),
    asOf: isoDateSchema,
  }),
  z.object({
    type: z.literal(ExportType.VISITING_FACULTY_HONORARIUM),
    month: monthSchema,
    ratePerLecture: z.number().finite().nonnegative().max(1_000_000),
  }),
]);

export type ExportRequest = z.infer<typeof exportRequestSchema>;
