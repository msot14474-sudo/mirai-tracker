import { StaffType } from '@prisma/client';
import { z } from 'zod';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';

const accessAccountFields = {
  name: z.string().trim().min(2).max(160),
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  notificationEmail: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase())
    .nullable()
    .optional()
    .default(null),
  password: z.string().min(12).max(256),
};

export const createAccessAccountSchema = z.object(accessAccountFields);

export const createFacultySchema = z.object({
  ...accessAccountFields,
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z0-9._/-]+$/)
    .transform((value) => value.toUpperCase()),
  staffType: z.nativeEnum(StaffType),
  offeringIds: z
    .array(uuidSchema)
    .max(50)
    .refine((values) => new Set(values).size === values.length, {
      message: 'Choose each subject offering only once.',
    })
    .default([]),
});

export type CreateAccessAccountInput = z.infer<
  typeof createAccessAccountSchema
>;
export type CreateFacultyInput = z.infer<typeof createFacultySchema>;
