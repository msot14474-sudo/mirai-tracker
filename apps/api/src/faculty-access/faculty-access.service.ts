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
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatIsoDate } from '../academic-calendar/calendar-engine';
import { AccessPolicyService } from '../auth/access-policy.service';
import { hashPassword } from '../auth/password';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { CreateFacultyInput } from './faculty-access.schemas';

@Injectable()
export class FacultyAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}

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
