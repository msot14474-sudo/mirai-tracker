import { z } from 'zod';
import { isoDateSchema } from '../academic-calendar/academic-calendar.schemas';

export const progressDateQuerySchema = z.object({
  asOf: isoDateSchema,
});

export type ProgressDateQuery = z.infer<typeof progressDateQuerySchema>;
