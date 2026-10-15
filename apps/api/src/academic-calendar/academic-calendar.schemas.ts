import {
  CalendarDayType,
  ExamType,
  SemesterStatus,
  WorkingSaturdayRule,
} from '@prisma/client';
import { z } from 'zod';
import { parseIsoDate } from './calendar-engine';

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z.string().refine(
  (value) => {
    try {
      parseIsoDate(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Use a valid YYYY-MM-DD date.' },
);

export const createSemesterSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    workingSaturdayRule: z.nativeEnum(WorkingSaturdayRule),
    defaultOnTrackThreshold: z.number().positive().max(10).default(1.15),
    defaultTightThreshold: z.number().positive().max(10).default(1),
    status: z.nativeEnum(SemesterStatus).default(SemesterStatus.DRAFT),
  })
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after the start date.',
      });
    }
    if (value.defaultOnTrackThreshold < value.defaultTightThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultOnTrackThreshold'],
        message: 'On-track threshold cannot be below the tight threshold.',
      });
    }
  });

export const updateSemesterSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  workingSaturdayRule: z.nativeEnum(WorkingSaturdayRule).optional(),
  defaultOnTrackThreshold: z.number().positive().max(10).optional(),
  defaultTightThreshold: z.number().positive().max(10).optional(),
  status: z.nativeEnum(SemesterStatus).optional(),
});

export const calendarRangeSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const createCalendarDaySchema = z.object({
  date: isoDateSchema,
  type: z.nativeEnum(CalendarDayType),
  title: z.string().trim().min(2).max(200),
  teachingAllowed: z.boolean().optional().default(false),
  notes: z.string().trim().max(4000).optional(),
});

export const updateCalendarDaySchema = createCalendarDaySchema.partial();

export const createExamWindowSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.nativeEnum(ExamType),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  syllabusDeadline: isoDateSchema,
});

export const updateExamWindowSchema = createExamWindowSchema.partial();

export const createSubjectSchema = z.object({
  campusId: uuidSchema.optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(
      /^[A-Za-z0-9._/-]+$/,
      'Use letters, numbers, dots, slashes, underscores or hyphens.',
    )
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .default(null)
    .transform((value) => value || null),
});

export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
export type UpdateSemesterInput = z.infer<typeof updateSemesterSchema>;
export type CreateCalendarDayInput = z.infer<typeof createCalendarDaySchema>;
export type UpdateCalendarDayInput = z.infer<typeof updateCalendarDaySchema>;
export type CreateExamWindowInput = z.infer<typeof createExamWindowSchema>;
export type UpdateExamWindowInput = z.infer<typeof updateExamWindowSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
