import { UserRole } from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { AuthenticatedUser } from './auth.types';

const user = (
  role: UserRole,
  options: {
    campusId?: string;
    staffProfileId?: string;
    batchId?: string;
  } = {},
): AuthenticatedUser => ({
  id: `user-${role}`,
  name: role,
  email: `${role.toLowerCase()}@mirai.local`,
  roles: [{ role, campusId: options.campusId ?? null }],
  staffProfileId: options.staffProfileId ?? null,
  studentProfile: options.batchId
    ? { id: 'student-profile', batchId: options.batchId }
    : null,
});

const offering = (
  campusId = 'campus-a',
  batchId = 'batch-a',
  staffProfileId = 'faculty-a',
) => ({
  batchId,
  batch: { semester: { campusId } },
  faculty: [{ staffProfileId }],
});

describe('AccessPolicyService', () => {
  const findUnique = jest.fn();
  const policy = new AccessPolicyService({
    subjectOffering: { findUnique },
  } as never);

  beforeEach(() => findUnique.mockReset());

  it('gives Program Managers global management access', async () => {
    const programManager = user(UserRole.PROGRAM_MANAGER);
    expect(policy.canManageCampus(programManager, 'any-campus')).toBe(true);
    await expect(
      policy.canManageOffering(programManager, 'any-offering'),
    ).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('limits Campus Managers to their assigned campus', async () => {
    const manager = user(UserRole.CAMPUS_MANAGER, { campusId: 'campus-a' });
    expect(policy.canManageCampus(manager, 'campus-a')).toBe(true);
    expect(policy.canManageCampus(manager, 'campus-b')).toBe(false);
    expect(() => policy.assertCanManageCampus(manager, 'campus-b')).toThrow(
      'cannot manage the timetable',
    );
    expect(policy.canViewCampus(manager, 'campus-a')).toBe(true);
    expect(policy.canViewCampus(manager, 'campus-b')).toBe(false);

    findUnique.mockResolvedValueOnce(offering('campus-b'));
    await expect(policy.canManageOffering(manager, 'offering-b')).resolves.toBe(
      false,
    );
  });

  it('allows faculty to manage an assigned offering', async () => {
    const faculty = user(UserRole.FACULTY, {
      campusId: 'campus-a',
      staffProfileId: 'faculty-a',
    });
    findUnique.mockResolvedValueOnce(offering());
    await expect(policy.canManageOffering(faculty, 'offering-a')).resolves.toBe(
      true,
    );
  });

  it('blocks faculty from another faculty member’s offering', async () => {
    const faculty = user(UserRole.FACULTY, {
      campusId: 'campus-a',
      staffProfileId: 'faculty-b',
    });
    findUnique.mockResolvedValueOnce(offering());
    await expect(policy.canManageOffering(faculty, 'offering-a')).resolves.toBe(
      false,
    );
  });

  it('allows students to view only offerings in their batch', async () => {
    const student = user(UserRole.STUDENT, {
      campusId: 'campus-a',
      batchId: 'batch-a',
    });
    findUnique.mockResolvedValueOnce(offering());
    await expect(policy.canViewOffering(student, 'offering-a')).resolves.toBe(
      true,
    );

    findUnique.mockResolvedValueOnce(offering('campus-a', 'batch-b'));
    await expect(policy.canViewOffering(student, 'offering-b')).resolves.toBe(
      false,
    );
  });

  it('never gives students offering-management access', async () => {
    const student = user(UserRole.STUDENT, {
      campusId: 'campus-a',
      batchId: 'batch-a',
    });
    findUnique.mockResolvedValueOnce(offering());
    await expect(policy.canManageOffering(student, 'offering-a')).resolves.toBe(
      false,
    );
  });

  it('reserves academic-calendar changes for global managers', () => {
    const student = user(UserRole.STUDENT, {
      campusId: 'campus-a',
      batchId: 'batch-a',
    });
    expect(() => policy.assertGlobalManager(student)).toThrow(
      'Only an Admin or Program Manager',
    );
  });
});
