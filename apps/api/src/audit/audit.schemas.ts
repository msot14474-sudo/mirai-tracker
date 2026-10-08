import { AuditAction } from '@prisma/client';
import { z } from 'zod';

export const auditHistoryQuerySchema = z.object({
  action: z.nativeEnum(AuditAction).optional(),
  entityType: z.string().trim().min(1).max(120).optional(),
  actorId: z.string().uuid().optional(),
  campusId: z.string().uuid().optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditHistoryQuery = z.infer<typeof auditHistoryQuerySchema>;
