import { AuditAction, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from './audit.service';

const manager: AuthenticatedUser = {
  id: 'manager-a',
  name: 'Manager',
  email: 'manager@mirai.local',
  roles: [{ role: UserRole.PROGRAM_MANAGER, campusId: null }],
  staffProfileId: null,
  studentProfile: null,
};

describe('AuditService', () => {
  const findMany = jest.fn();
  const prisma = { auditEvent: { findMany } };
  const access = { assertGlobalManager: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('enforces global-manager access and applies bounded filters', async () => {
    findMany.mockResolvedValue([
      { id: 'event-a', occurredAt: new Date('2026-10-08T10:00:00Z') },
    ]);
    const service = new AuditService(prisma as never, access as never);

    const result = await service.history(
      {
        action: AuditAction.UPDATE,
        entityType: 'SessionLog',
        limit: 25,
      },
      manager,
    );

    expect(access.assertGlobalManager).toHaveBeenCalledWith(manager);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: AuditAction.UPDATE, entityType: 'SessionLog' },
        take: 25,
      }),
    );
    expect(result.nextBefore).toBeNull();
  });

  it('returns a cursor when the requested page is full', async () => {
    findMany.mockResolvedValue([
      { id: 'event-a', occurredAt: new Date('2026-10-08T10:00:00Z') },
    ]);
    const service = new AuditService(prisma as never, access as never);

    await expect(service.history({ limit: 1 }, manager)).resolves.toMatchObject(
      { nextBefore: '2026-10-08T10:00:00.000Z' },
    );
  });
});
