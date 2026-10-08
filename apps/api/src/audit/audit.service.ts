import { Injectable } from '@nestjs/common';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AuditHistoryQuery } from './audit.schemas';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async history(query: AuditHistoryQuery, user: AuthenticatedUser) {
    this.access.assertGlobalManager(user);

    const events = await this.prisma.auditEvent.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.campusId ? { campusId: query.campusId } : {}),
        ...(query.before ? { occurredAt: { lt: new Date(query.before) } } : {}),
      },
      take: query.limit,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        metadata: true,
        occurredAt: true,
        actor: { select: { id: true, name: true, email: true } },
        campus: { select: { id: true, code: true, name: true } },
      },
    });

    return {
      events,
      nextBefore:
        events.length === query.limit
          ? events.at(-1)?.occurredAt.toISOString()
          : null,
    };
  }
}
