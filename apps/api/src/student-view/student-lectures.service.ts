import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StudentLecturesService {
  constructor(private readonly prisma: PrismaService) {}

  private async enrollment(user: AuthenticatedUser) {
    if (
      !user.studentProfile ||
      !user.roles.some((role) => role.role === UserRole.STUDENT)
    )
      throw new ForbiddenException('An active student enrolment is required.');
    const student = await this.prisma.studentProfile.findFirst({
      where: {
        id: user.studentProfile.id,
        userId: user.id,
        enrollmentStatus: 'ACTIVE',
        batch: { active: true, semester: { campus: { active: true } } },
      },
      include: {
        batch: {
          include: {
            semester: {
              select: {
                campusId: true,
                campus: { select: { timezone: true } },
              },
            },
          },
        },
      },
    });
    if (
      !student ||
      !user.roles.some(
        (role) =>
          role.role === UserRole.STUDENT &&
          (role.campusId === null ||
            role.campusId === student.batch.semester.campusId),
      )
    )
      throw new ForbiddenException(
        'Your student campus assignment needs to be verified.',
      );
    return student;
  }

  private scope(
    batchId: string,
    campusId: string,
  ): Prisma.ScheduledSessionWhereInput {
    return {
      offering: { batchId, batch: { semester: { campusId } } },
      endsAt: { lte: new Date() },
      status: { in: ['SCHEDULED', 'COMPLETED'] },
    };
  }

  async lectures(
    user: AuthenticatedUser,
    review: 'pending' | 'reviewed',
    page: number,
  ) {
    const student = await this.enrollment(user);
    const base = this.scope(student.batchId, student.batch.semester.campusId);
    const own = { studentProfileId: student.id };
    const where = {
      ...base,
      studentReviews: review === 'pending' ? { none: own } : { some: own },
    };
    const [lectures, total, pendingCount] = await this.prisma.$transaction([
      this.prisma.scheduledSession.findMany({
        where,
        orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
        skip: page * 20,
        take: 20,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          offering: {
            select: { subject: { select: { code: true, name: true } } },
          },
          facultyAssignment: {
            select: {
              staffProfile: { select: { user: { select: { name: true } } } },
            },
          },
          logs: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: { coveredSummary: true },
          },
          studentReviews: {
            where: own,
            select: { understood: true, unclearTopics: true, updatedAt: true },
          },
        },
      }),
      this.prisma.scheduledSession.count({ where }),
      this.prisma.scheduledSession.count({
        where: { ...base, studentReviews: { none: own } },
      }),
    ]);
    return {
      page,
      pageSize: 20,
      total,
      pendingCount,
      timezone: student.batch.semester.campus.timezone,
      lectures: lectures.map((lecture) => ({
        id: lecture.id,
        startsAt: lecture.startsAt,
        endsAt: lecture.endsAt,
        subject: lecture.offering.subject,
        teacher: lecture.facultyAssignment?.staffProfile.user.name ?? null,
        coveredSummary: lecture.logs[0]?.coveredSummary ?? null,
        review: lecture.studentReviews[0] ?? null,
      })),
    };
  }

  async review(
    user: AuthenticatedUser,
    sessionId: string,
    input: { understood: boolean; unclearTopics?: string },
  ) {
    const student = await this.enrollment(user);
    const session = await this.prisma.scheduledSession.findFirst({
      where: {
        id: sessionId,
        ...this.scope(student.batchId, student.batch.semester.campusId),
      },
      select: { id: true },
    });
    if (!session)
      throw new NotFoundException(
        'This lecture is not available for your feedback.',
      );
    const data = {
      understood: input.understood,
      unclearTopics: input.understood ? null : input.unclearTopics!.trim(),
    };
    return this.prisma.lectureReview.upsert({
      where: {
        studentProfileId_scheduledSessionId: {
          studentProfileId: student.id,
          scheduledSessionId: session.id,
        },
      },
      create: {
        studentProfileId: student.id,
        scheduledSessionId: session.id,
        ...data,
      },
      update: data,
      select: { understood: true, unclearTopics: true, updatedAt: true },
    });
  }
}
