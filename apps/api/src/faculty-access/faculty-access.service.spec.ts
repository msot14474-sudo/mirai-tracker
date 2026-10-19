import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffType, UserRole, UserStatus } from '@prisma/client';
import { FacultyAccessService } from './faculty-access.service';

const campusId = '00000000-0000-4000-8000-000000000001';
const offeringId = '00000000-0000-4000-8000-000000000002';

const actor = {
  id: 'manager-a',
  name: 'Campus Manager',
  email: 'manager@example.edu',
  roles: [{ role: UserRole.CAMPUS_MANAGER, campusId }],
  staffProfileId: null,
  studentProfile: null,
};

const programManager = {
  ...actor,
  id: 'program-manager-a',
  roles: [{ role: UserRole.PROGRAM_MANAGER, campusId: null }],
};

describe('FacultyAccessService', () => {
  const campusFindUnique = jest.fn();
  const offeringFindMany = jest.fn();
  const userCreate = jest.fn();
  const userFindMany = jest.fn();
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const assignmentCreateMany = jest.fn();
  const auditCreate = jest.fn();
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { create: userCreate, update: userUpdate },
    facultyAssignment: { createMany: assignmentCreateMany },
    auditEvent: { create: auditCreate },
  };
  const prisma = {
    campus: { findUnique: campusFindUnique },
    subjectOffering: { findMany: offeringFindMany },
    staffProfile: { findMany: jest.fn() },
    user: {
      create: userCreate,
      findMany: userFindMany,
      findUnique: userFindUnique,
    },
    $transaction: jest.fn((work: (client: typeof transaction) => unknown) =>
      work(transaction),
    ),
  };
  const access = {
    assertCanManageCampus: jest.fn(),
    assertGlobalManager: jest.fn(),
    isGlobalManager: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockReset();
    access.assertGlobalManager.mockReset();
    campusFindUnique.mockResolvedValue({
      id: campusId,
      code: 'HI-TECH',
      name: 'HI-Tech',
      active: true,
    });
    offeringFindMany.mockResolvedValue([
      {
        id: offeringId,
        batch: {
          semester: {
            startDate: new Date('2026-07-01T00:00:00.000Z'),
            endDate: new Date('2026-12-15T00:00:00.000Z'),
          },
        },
      },
    ]);
    userCreate.mockResolvedValue({
      id: 'faculty-user-a',
      name: 'Dr Asha',
      email: 'asha@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
      staffProfile: {
        id: 'staff-a',
        employeeCode: 'FAC-101',
        staffType: StaffType.REGULAR,
        active: true,
      },
    });
    assignmentCreateMany.mockResolvedValue({ count: 1 });
    auditCreate.mockResolvedValue({ id: 'audit-a' });
    access.isGlobalManager.mockReturnValue(false);
    userUpdate.mockResolvedValue({
      id: 'student-user-a',
      name: 'Student One',
      email: 'student.one@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
    });
  });

  function service() {
    return new FacultyAccessService(prisma as never, access as never);
  }

  it('creates a campus-scoped faculty login with hashed credentials and assignments', async () => {
    const result = await service().createFaculty(
      campusId,
      {
        name: 'Dr Asha',
        email: 'asha@example.edu',
        notificationEmail: null,
        employeeCode: 'FAC-101',
        staffType: StaffType.REGULAR,
        password: 'a-strong-temporary-password',
        offeringIds: [offeringId],
      },
      actor,
    );

    expect(access.assertCanManageCampus).toHaveBeenCalledWith(actor, campusId);
    const createData = userCreate.mock.calls[0][0].data;
    expect(createData.roleAssignments.create).toEqual({
      role: UserRole.FACULTY,
      campusId,
      scopeKey: campusId,
    });
    expect(createData.passwordCredential.create.passwordHash).not.toContain(
      'a-strong-temporary-password',
    );
    expect(createData.passwordCredential.create.passwordSalt).toHaveLength(32);
    expect(assignmentCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          offeringId,
          staffProfileId: 'staff-a',
        }),
      ],
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: actor.id,
        campusId,
        entityType: 'FacultyAccess',
      }),
    });
    expect(JSON.stringify(auditCreate.mock.calls[0][0])).not.toContain(
      'a-strong-temporary-password',
    );
    expect(result).toMatchObject({ assignedOfferings: 1 });
  });

  it('allows an administrator to assign campus subjects when granting faculty access', async () => {
    const admin = {
      ...actor,
      roles: [{ role: UserRole.ADMIN, campusId: null }],
    };
    await service().createFaculty(
      campusId,
      {
        name: 'Dr Asha',
        email: 'asha@example.edu',
        notificationEmail: null,
        employeeCode: 'FAC-101',
        staffType: StaffType.REGULAR,
        password: 'a-strong-temporary-password',
        offeringIds: [offeringId],
      },
      admin,
    );
    expect(assignmentCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ offeringId, staffProfileId: 'staff-a' }),
      ],
    });
  });

  it('rejects subject offerings outside the managed campus', async () => {
    offeringFindMany.mockResolvedValue([]);

    await expect(
      service().createFaculty(
        campusId,
        {
          name: 'Dr Asha',
          email: 'asha@example.edu',
          notificationEmail: null,
          employeeCode: 'FAC-101',
          staffType: StaffType.REGULAR,
          password: 'a-strong-temporary-password',
          offeringIds: [offeringId],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('creates a campus-scoped Campus Manager account for a global manager', async () => {
    userCreate.mockResolvedValue({
      id: 'campus-manager-user-a',
      name: 'New Campus Manager',
      email: 'campus.manager@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
    });

    const result = await service().createCampusManager(
      campusId,
      {
        name: 'New Campus Manager',
        email: 'campus.manager@example.edu',
        notificationEmail: null,
        password: 'a-strong-temporary-password',
      },
      programManager,
    );

    expect(access.assertGlobalManager).toHaveBeenCalledWith(programManager);
    expect(userCreate.mock.calls[0][0].data.roleAssignments.create).toEqual({
      role: UserRole.CAMPUS_MANAGER,
      campusId,
      scopeKey: campusId,
    });
    expect(result).toMatchObject({
      role: UserRole.CAMPUS_MANAGER,
      campusId,
      passwordStoredAsHash: true,
    });
  });

  it('creates a global Administrator account for a Program Manager', async () => {
    userCreate.mockResolvedValue({
      id: 'admin-user-b',
      name: 'New Administrator',
      email: 'new.admin@example.edu',
      notificationEmail: 'otp@example.edu',
      status: UserStatus.ACTIVE,
    });

    const result = await service().createAdministrator(
      {
        name: 'New Administrator',
        email: 'new.admin@example.edu',
        notificationEmail: 'otp@example.edu',
        password: 'a-strong-temporary-password',
      },
      programManager,
    );

    expect(access.assertGlobalManager).toHaveBeenCalledWith(programManager);
    expect(userCreate.mock.calls[0][0].data.roleAssignments.create).toEqual({
      role: UserRole.ADMIN,
      campusId: null,
      scopeKey: 'GLOBAL',
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: programManager.id,
        campusId: null,
        entityType: 'UserAccess',
        after: expect.objectContaining({ role: UserRole.ADMIN }),
      }),
    });
    expect(JSON.stringify(auditCreate.mock.calls[0][0])).not.toContain(
      'a-strong-temporary-password',
    );
    expect(result).toMatchObject({ role: UserRole.ADMIN, campusId: null });
  });

  it('rejects Administrator creation outside the global manager role', async () => {
    access.assertGlobalManager.mockImplementationOnce(() => {
      throw new ForbiddenException();
    });

    await expect(
      service().createAdministrator(
        {
          name: 'New Administrator',
          email: 'new.admin@example.edu',
          notificationEmail: null,
          password: 'a-strong-temporary-password',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('rejects student account editing by a campus manager', async () => {
    userFindUnique.mockResolvedValue({
      id: 'student-user-a',
      roleAssignments: [{ role: UserRole.STUDENT, campusId }],
    });
    await expect(
      service().updateAccount('student-user-a', { name: 'Changed' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('prevents a campus manager from changing an elevated account', async () => {
    userFindUnique.mockResolvedValue({
      id: 'campus-manager-b',
      name: 'Campus Manager B',
      email: 'manager.b@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
      roleAssignments: [{ role: UserRole.CAMPUS_MANAGER, campusId }],
    });

    await expect(
      service().updateAccount(
        'campus-manager-b',
        { password: 'a-new-manager-password' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('lets an administrator update their own account without suspending it', async () => {
    const administrator = {
      ...programManager,
      id: 'admin-user-a',
      roles: [{ role: UserRole.ADMIN, campusId: null }],
    };
    access.isGlobalManager.mockReturnValue(true);
    userFindUnique.mockResolvedValue({
      id: administrator.id,
      name: 'Administrator',
      email: 'admin@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
      roleAssignments: administrator.roles,
    });
    userUpdate.mockResolvedValue({
      id: administrator.id,
      name: 'Administrator Updated',
      email: 'admin@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
    });

    await expect(
      service().updateAccount(
        administrator.id,
        { name: 'Administrator Updated' },
        administrator,
      ),
    ).resolves.toMatchObject({
      account: { name: 'Administrator Updated' },
      passwordChanged: false,
    });

    await expect(
      service().updateAccount(
        administrator.id,
        { status: UserStatus.SUSPENDED },
        administrator,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('replaces previous roles when an existing faculty email is assigned administrator access', async () => {
    const target = {
      id: 'faculty-user-a',
      name: 'Faculty',
      email: 'faculty@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
      roleAssignments: [{ role: UserRole.FACULTY, campusId }],
    };
    userFindUnique.mockResolvedValue(target);
    userUpdate.mockResolvedValue(target);
    access.isGlobalManager.mockReturnValue(true);
    await service().createAdministrator(
      {
        name: 'Faculty',
        email: target.email,
        notificationEmail: null,
        password: 'not-a-replacement-password',
      },
      programManager,
    );
    expect(userCreate).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          roleAssignments: {
            deleteMany: {},
            create: {
              role: UserRole.ADMIN,
              campusId: null,
              scopeKey: 'GLOBAL',
            },
          },
        },
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          before: expect.objectContaining({ roles: target.roleAssignments }),
          after: expect.objectContaining({ role: UserRole.ADMIN }),
        }),
      }),
    );
  });

  it('replaces global access with a campus role and blocks campus-manager promotions', async () => {
    const target = {
      id: 'other-user',
      name: 'Other',
      email: 'other@example.edu',
      notificationEmail: null,
      status: UserStatus.ACTIVE,
      roleAssignments: [{ role: UserRole.ADMIN, campusId: null }],
    };
    userFindUnique.mockResolvedValue(target);
    userUpdate.mockResolvedValue(target);
    access.isGlobalManager.mockReturnValue(true);
    await service().updateAccount(
      target.id,
      { role: UserRole.CAMPUS_MANAGER, campusId },
      programManager,
    );
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          roleAssignments: {
            deleteMany: {},
            create: {
              role: UserRole.CAMPUS_MANAGER,
              campusId,
              scopeKey: campusId,
            },
          },
        },
      }),
    );
    userUpdate.mockClear();
    access.isGlobalManager.mockReturnValue(false);
    userFindUnique.mockResolvedValue({
      ...target,
      roleAssignments: [{ role: UserRole.FACULTY, campusId }],
    });
    access.assertGlobalManager.mockImplementation(() => {
      throw new ForbiddenException();
    });
    await expect(
      service().updateAccount(target.id, { role: UserRole.ADMIN }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it('lists global administrators for global managers but keeps campus managers scoped', async () => {
    userFindMany.mockResolvedValue([]);
    access.isGlobalManager.mockReturnValue(true);
    await service().accounts(campusId, programManager);
    expect(userFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          roleAssignments: {
            some: {
              OR: [
                { campusId },
                {
                  campusId: null,
                  role: { in: [UserRole.ADMIN, UserRole.PROGRAM_MANAGER] },
                },
              ],
            },
          },
        },
      }),
    );
    access.isGlobalManager.mockReturnValue(false);
    await service().accounts(campusId, actor);
    expect(userFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          roleAssignments: {
            some: {
              campusId,
              role: UserRole.FACULTY,
            },
          },
        },
      }),
    );
  });
});
