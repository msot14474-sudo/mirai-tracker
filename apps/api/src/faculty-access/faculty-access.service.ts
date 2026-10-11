import {
  AuditAction,
  FacultyAssignmentType,
  Prisma,
  SemesterStatus,
  StaffType,
  SubjectOfferingStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatIsoDate } from '../academic-calendar/calendar-engine';
import { AccessPolicyService } from '../auth/access-policy.service';
import { hashPassword } from '../auth/password';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  CreateAccessAccountInput,
  CreateFacultyInput,
  UpdateManagedAccountInput,
} from './faculty-access.schemas';

@Injectable()
export class FacultyAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

  async accounts(campusId: string, actor: AuthenticatedUser) {
    await this.requireCampus(campusId);
    this.access.assertCanManageCampus(actor, campusId);
    const globalManager = this.access.isGlobalManager(actor);
    const accounts = await this.prisma.user.findMany({
      where: globalManager
        ? {
            OR: [
              { id: actor.id },
              {
                roleAssignments: {
                  some: {
                    OR: [
                      { campusId },
                      {
                        role: {
                          in: [UserRole.ADMIN, UserRole.PROGRAM_MANAGER],
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {
            roleAssignments: {
              some: {
                campusId,
                role: { in: [UserRole.FACULTY, UserRole.STUDENT] },
              },
            },
          },
      select: {
        id: true,
        name: true,
        email: true,
        notificationEmail: true,
        status: true,
        roleAssignments: {
          select: {
            role: true,
            campusId: true,
            campus: { select: { name: true } },
          },
        },
        staffProfile: {
          select: { employeeCode: true, staffType: true, active: true },
        },
        studentProfile: {
          select: {
            studentCode: true,
            enrollmentStatus: true,
            batch: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });

    return { accounts };
  }

  async updateAccount(
    userId: string,
    input: UpdateManagedAccountInput,
    actor: AuthenticatedUser,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        notificationEmail: true,
        status: true,
        roleAssignments: { select: { role: true, campusId: true } },
      },
    });
    if (!target) throw new NotFoundException('Account not found.');

    const globalManager = this.access.isGlobalManager(actor);
    if (!globalManager) {
      const managedCampuses = new Set(
        actor.roles
          .filter(
            (assignment) =>
              assignment.role === UserRole.CAMPUS_MANAGER &&
              assignment.campusId,
          )
          .map((assignment) => assignment.campusId!),
      );
      const elevatedRoles = new Set<UserRole>([
        UserRole.ADMIN,
        UserRole.PROGRAM_MANAGER,
        UserRole.CAMPUS_MANAGER,
      ]);
      const campusAccountRoles = new Set<UserRole>([
        UserRole.FACULTY,
        UserRole.STUDENT,
      ]);
      const elevated = target.roleAssignments.some((assignment) =>
        elevatedRoles.has(assignment.role),
      );
      const withinScope = target.roleAssignments.some(
        (assignment) =>
          assignment.campusId &&
          managedCampuses.has(assignment.campusId) &&
          campusAccountRoles.has(assignment.role),
      );
      if (elevated || !withinScope) {
        throw new ForbiddenException(
          'Campus Managers can update only faculty and students in their campus.',
        );
      }
    }

    if (
      actor.id === target.id &&
      input.status &&
      input.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('You cannot suspend your own account.');
    }

    const credential = input.password
      ? await hashPassword(input.password)
      : null;
    const primaryCampusId =
      target.roleAssignments.find((assignment) => assignment.campusId)
        ?.campusId ?? null;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.user.update({
          where: { id: target.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.notificationEmail !== undefined
              ? { notificationEmail: input.notificationEmail }
              : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(credential
              ? {
                  passwordCredential: {
                    upsert: { create: credential, update: credential },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            email: true,
            notificationEmail: true,
            status: true,
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: actor.id,
            campusId: primaryCampusId,
            action: AuditAction.UPDATE,
            entityType: 'UserAccess',
            entityId: target.id,
            before: {
              name: target.name,
              email: target.email,
              notificationEmail: target.notificationEmail,
              status: target.status,
            },
            after: {
              name: account.name,
              email: account.email,
              notificationEmail: account.notificationEmail,
              status: account.status,
              passwordChanged: Boolean(credential),
            },
          },
        });
        return { account, passwordChanged: Boolean(credential) };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }
      throw error;
    }
  }

  async campus(campusId: string, user: AuthenticatedUser) {
    const campus = await this.requireCampus(campusId);
    this.access.assertCanManageCampus(user, campusId);

    const [faculty, offerings] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where: {
          user: {
            roleAssignments: {
              some: { role: UserRole.FACULTY, campusId },
            },
          },
        },
        select: {
          id: true,
          employeeCode: true,
          staffType: true,
          active: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              notificationEmail: true,
              status: true,
            },
          },
          facultyAssignments: {
            where: {
              active: true,
              offering: { batch: { semester: { campusId } } },
            },
            select: {
              id: true,
              type: true,
              offering: {
                select: {
                  id: true,
                  subject: { select: { code: true, name: true } },
                  batch: { select: { code: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ user: { name: 'asc' } }, { employeeCode: 'asc' }],
      }),
      this.prisma.subjectOffering.findMany({
        where: {
          status: { not: SubjectOfferingStatus.ARCHIVED },
          batch: {
            active: true,
            semester: {
              campusId,
              status: { not: SemesterStatus.ARCHIVED },
            },
          },
        },
        select: {
          id: true,
          subject: { select: { code: true, name: true } },
          batch: {
            select: {
              code: true,
              name: true,
              semester: {
                select: {
                  id: true,
                  name: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
          },
        },
        orderBy: [
          { batch: { semester: { startDate: 'desc' } } },
          { batch: { code: 'asc' } },
          { subject: { code: 'asc' } },
        ],
      }),
    ]);

    return {
      campus,
      faculty,
      offerings: offerings.map((offering) => ({
        ...offering,
        batch: {
          ...offering.batch,
          semester: {
            ...offering.batch.semester,
            startDate: formatIsoDate(offering.batch.semester.startDate),
            endDate: formatIsoDate(offering.batch.semester.endDate),
          },
        },
      })),
    };
  }

  async createFaculty(
    campusId: string,
    input: CreateFacultyInput,
    actor: AuthenticatedUser,
  ) {
    await this.requireCampus(campusId);
    this.access.assertCanManageCampus(actor, campusId);

    const offerings = input.offeringIds.length
      ? await this.prisma.subjectOffering.findMany({
          where: {
            id: { in: input.offeringIds },
            status: { not: SubjectOfferingStatus.ARCHIVED },
            batch: {
              active: true,
              semester: {
                campusId,
                status: { not: SemesterStatus.ARCHIVED },
              },
            },
          },
          select: {
            id: true,
            batch: {
              select: {
                semester: { select: { startDate: true, endDate: true } },
              },
            },
          },
        })
      : [];
    if (offerings.length !== input.offeringIds.length) {
      throw new BadRequestException(
        'Every selected subject must belong to the managed campus.',
      );
    }

    const credential = await hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            name: input.name,
            email: input.email,
            notificationEmail: input.notificationEmail,
            status: UserStatus.ACTIVE,
            passwordCredential: { create: credential },
            staffProfile: {
              create: {
                employeeCode: input.employeeCode,
                staffType: input.staffType,
              },
            },
            roleAssignments: {
              create: {
                role: UserRole.FACULTY,
                campusId,
                scopeKey: campusId,
              },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            notificationEmail: true,
            status: true,
            staffProfile: {
              select: {
                id: true,
                employeeCode: true,
                staffType: true,
                active: true,
              },
            },
          },
        });

        if (offerings.length) {
          await transaction.facultyAssignment.createMany({
            data: offerings.map((offering) => ({
              offeringId: offering.id,
              staffProfileId: created.staffProfile!.id,
              type:
                input.staffType === StaffType.VISITING
                  ? FacultyAssignmentType.VISITING
                  : FacultyAssignmentType.PRIMARY,
              startDate: offering.batch.semester.startDate,
              endDate: offering.batch.semester.endDate,
            })),
          });
        }

        await transaction.auditEvent.create({
          data: {
            actorId: actor.id,
            campusId,
            action: AuditAction.CREATE,
            entityType: 'FacultyAccess',
            entityId: created.id,
            after: {
              name: created.name,
              email: created.email,
              notificationEmail: created.notificationEmail,
              employeeCode: created.staffProfile?.employeeCode,
              staffType: created.staffProfile?.staffType,
              offeringIds: input.offeringIds,
            },
          },
        });

        return {
          faculty: created,
          assignedOfferings: offerings.length,
          passwordStoredAsHash: true,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A faculty account with this email or employee code already exists.',
        );
      }
      throw error;
    }
  }

  async createCampusManager(
    campusId: string,
    input: CreateAccessAccountInput,
    actor: AuthenticatedUser,
  ) {
    await this.requireCampus(campusId);
    this.access.assertGlobalManager(actor);
    return this.createRoleAccount(
      input,
      actor,
      UserRole.CAMPUS_MANAGER,
      campusId,
    );
  }

  async createAdministrator(
    input: CreateAccessAccountInput,
    actor: AuthenticatedUser,
  ) {
    this.access.assertGlobalManager(actor);
    return this.createRoleAccount(input, actor, UserRole.ADMIN, null);
  }

  private async createRoleAccount(
    input: CreateAccessAccountInput,
    actor: AuthenticatedUser,
    role: UserRole,
    campusId: string | null,
  ) {
    const credential = await hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            name: input.name,
            email: input.email,
            notificationEmail: input.notificationEmail,
            status: UserStatus.ACTIVE,
            passwordCredential: { create: credential },
            roleAssignments: {
              create: {
                role,
                campusId,
                scopeKey: campusId ?? 'GLOBAL',
              },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            notificationEmail: true,
            status: true,
          },
        });

        await transaction.auditEvent.create({
          data: {
            actorId: actor.id,
            campusId,
            action: AuditAction.CREATE,
            entityType: 'UserAccess',
            entityId: created.id,
            after: {
              name: created.name,
              email: created.email,
              notificationEmail: created.notificationEmail,
              role,
              scopeKey: campusId ?? 'GLOBAL',
            },
          },
        });

        return {
          account: created,
          role,
          campusId,
          passwordStoredAsHash: true,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this login email already exists.',
        );
      }
      throw error;
    }
  }

  private async requireCampus(campusId: string) {
    const campus = await this.prisma.campus.findUnique({
      where: { id: campusId },
      select: { id: true, code: true, name: true, active: true },
    });
    if (!campus) throw new NotFoundException('Campus not found.');
    if (!campus.active) {
      throw new BadRequestException(
        'Faculty access cannot be added to an inactive campus.',
      );
    }
    return campus;
  }
}
