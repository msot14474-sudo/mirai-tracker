import { UserRole } from '@prisma/client';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from './auth.types';

const globalRoles = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
]);

@Injectable()
export class AccessPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  isGlobalManager(user: AuthenticatedUser) {
    return user.roles.some((assignment) => globalRoles.has(assignment.role));
  }

  canManageCampus(user: AuthenticatedUser, campusId: string) {
    return (
      this.isGlobalManager(user) ||
      user.roles.some(
        (assignment) =>
          assignment.role === UserRole.CAMPUS_MANAGER &&
          assignment.campusId === campusId,
      )
    );
  }

  canViewCampus(user: AuthenticatedUser, campusId: string) {
    return (
      this.isGlobalManager(user) ||
      user.roles.some((assignment) => assignment.campusId === campusId)
    );
  }

  assertGlobalManager(user: AuthenticatedUser) {
    if (!this.isGlobalManager(user)) {
      throw new ForbiddenException(
        'Only an Admin or Program Manager can manage academic setup.',
      );
    }
  }

  assertCanViewCampus(user: AuthenticatedUser, campusId: string) {
    if (!this.canViewCampus(user, campusId)) {
      throw new ForbiddenException('You cannot view this campus calendar.');
    }
  }

  assertCanManageCampus(user: AuthenticatedUser, campusId: string) {
    if (!this.canManageCampus(user, campusId)) {
      throw new ForbiddenException(
        'You cannot manage the timetable for this campus.',
      );
    }
  }

  async canViewOffering(user: AuthenticatedUser, offeringId: string) {
    if (this.isGlobalManager(user)) return true;

    const offering = await this.loadOfferingAccess(offeringId);
    if (!offering) return false;

    const campusManager = user.roles.some(
      (assignment) =>
        assignment.role === UserRole.CAMPUS_MANAGER &&
        assignment.campusId === offering.batch.semester.campusId,
    );
    const assignedFaculty =
      user.roles.some((assignment) => assignment.role === UserRole.FACULTY) &&
      Boolean(
        user.staffProfileId &&
        offering.faculty.some(
          (assignment) => assignment.staffProfileId === user.staffProfileId,
        ),
      );
    const enrolledStudent =
      user.roles.some((assignment) => assignment.role === UserRole.STUDENT) &&
      user.studentProfile?.batchId === offering.batchId;

    return campusManager || assignedFaculty || enrolledStudent;
  }

  async canManageOffering(user: AuthenticatedUser, offeringId: string) {
    if (this.isGlobalManager(user)) return true;

    const offering = await this.loadOfferingAccess(offeringId);
    if (!offering) return false;

    if (
      user.roles.some(
        (assignment) =>
          assignment.role === UserRole.CAMPUS_MANAGER &&
          assignment.campusId === offering.batch.semester.campusId,
      )
    ) {
      return true;
    }

    return Boolean(
      user.roles.some((assignment) => assignment.role === UserRole.FACULTY) &&
      user.staffProfileId &&
      offering.faculty.some(
        (assignment) => assignment.staffProfileId === user.staffProfileId,
      ),
    );
  }

  async assertCanViewOffering(user: AuthenticatedUser, offeringId: string) {
    if (!(await this.canViewOffering(user, offeringId))) {
      throw new ForbiddenException('You cannot view this subject offering.');
    }
  }

  async assertCanManageOffering(user: AuthenticatedUser, offeringId: string) {
    if (!(await this.canManageOffering(user, offeringId))) {
      throw new ForbiddenException('You cannot change this subject offering.');
    }
  }

  private loadOfferingAccess(offeringId: string) {
    return this.prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      select: {
        batchId: true,
        batch: { select: { semester: { select: { campusId: true } } } },
        faculty: {
          where: { active: true },
          select: { staffProfileId: true },
        },
      },
    });
  }
}
