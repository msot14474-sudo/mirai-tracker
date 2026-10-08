import { z } from 'zod';
import {
  isoDateSchema,
  uuidSchema,
} from '../academic-calendar/academic-calendar.schemas';

export const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid HH:mm time.');

export const createTimetableEntrySchema = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: timeSchema,
  endTime: timeSchema,
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema,
  facultyAssignmentId: uuidSchema.nullable().optional().default(null),
});

export const updateTimetableEntrySchema = createTimetableEntrySchema.partial();

export type CreateTimetableEntryInput = z.infer<
  typeof createTimetableEntrySchema
>;
export type UpdateTimetableEntryInput = z.infer<
  typeof updateTimetableEntrySchema
>;
