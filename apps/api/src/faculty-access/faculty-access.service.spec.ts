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

const administrator = {
  ...actor,
  id: 'admin-a',
  roles: [{ role: UserRole.ADMIN, campusId: null }],
};

describe('FacultyAccessService', () => {
  const campusFindUnique = jest.fn();
  const offeringFindMany = jest.fn();
  const userCreate = jest.fn();
  const assignmentCreateMany = jest.fn();
  const auditCreate = jest.fn();
  const transaction = {
    user: { create: userCreate },
    facultyAssignment: { createMany: assignmentCreateMany },
    auditEvent: { create: auditCreate },
  };
  const prisma = {
    campus: { findUnique: campusFindUnique },
    subjectOffering: { findMany: offeringFindMany },
    staffProfile: { findMany: jest.fn() },
    $transaction: jest.fn((work: (client: typeof transaction) => unknown) =>
      work(transaction),
    ),
  };
  const access = {
    assertCanManageCampus: jest.fn(),
    assertGlobalManager: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('creates a global Administrator account only for an Administrator', async () => {
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
      administrator,
    );

    expect(userCreate.mock.calls[0][0].data.roleAssignments.create).toEqual({
      role: UserRole.ADMIN,
      campusId: null,
      scopeKey: 'GLOBAL',
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: administrator.id,
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

  it('rejects Administrator creation by a Program Manager', async () => {
    await expect(
      service().createAdministrator(
        {
          name: 'New Administrator',
          email: 'new.admin@example.edu',
          notificationEmail: null,
          password: 'a-strong-temporary-password',
        },
        programManager,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userCreate).not.toHaveBeenCalled();
  });
});
