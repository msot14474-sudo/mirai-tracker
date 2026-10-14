import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { StudentLecturesService } from './student-lectures.service';
import { lectureReviewSchema } from './lecture-review.schemas';
import { AuthenticatedUser } from '../auth/auth.types';
const user: AuthenticatedUser = {
  id: 'user-a',
  name: 'Student',
  email: 'a@example.com',
  roles: [{ role: UserRole.STUDENT, campusId: 'campus-a' }],
  staffProfileId: null,
  studentProfile: { id: 'student-a', batchId: 'batch-a' },
};
function setup() {
  const prisma = {
    studentProfile: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'student-a',
        batchId: 'batch-a',
        batch: {
          semester: {
            campusId: 'campus-a',
            campus: { timezone: 'Asia/Kolkata' },
          },
        },
      }),
    },
    scheduledSession: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue({ id: 'session-a' }),
    },
    lectureReview: {
      upsert: jest
        .fn()
        .mockResolvedValue({ understood: true, unclearTopics: null }),
    },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };
  return { prisma, service: new StudentLecturesService(prisma as never) };
}
describe('Student lecture feedback', () => {
  it('requires a nonblank explanation for no and rejects forged ownership fields', () => {
    expect(
      lectureReviewSchema.safeParse({ understood: false, unclearTopics: '  ' })
        .success,
    ).toBe(false);
    expect(
      lectureReviewSchema.safeParse({
        understood: false,
        unclearTopics: 'Recursion',
      }).success,
    ).toBe(true);
    expect(lectureReviewSchema.safeParse({ understood: true }).success).toBe(
      true,
    );
    expect(
      lectureReviewSchema.safeParse({
        understood: true,
        studentProfileId: 'other',
      }).success,
    ).toBe(false);
    expect(
      lectureReviewSchema.safeParse({
        understood: false,
        unclearTopics: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
  });
  it('scopes pending lectures and reviews to the authenticated campus and batch', async () => {
    const { prisma, service } = setup();
    await service.lectures(user, 'pending', 1);
    expect(prisma.studentProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-a',
          enrollmentStatus: 'ACTIVE',
        }),
      }),
    );
    expect(prisma.scheduledSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: {
          offering: {
            batchId: 'batch-a',
            batch: { semester: { campusId: 'campus-a' } },
          },
          endsAt: { lte: expect.any(Date) },
          status: { in: ['SCHEDULED', 'COMPLETED'] },
          studentReviews: { none: { studentProfileId: 'student-a' } },
        },
        select: expect.objectContaining({
          studentReviews: expect.objectContaining({
            where: { studentProfileId: 'student-a' },
          }),
        }),
      }),
    );
  });
  it('rejects inactive enrolment and mismatched campus roles', async () => {
    const { prisma, service } = setup();
    prisma.studentProfile.findFirst.mockResolvedValueOnce(null);
    await expect(service.lectures(user, 'pending', 0)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.lectures(
        {
          ...user,
          roles: [{ role: UserRole.STUDENT, campusId: 'other-campus' }],
        },
        'pending',
        0,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.scheduledSession.findMany).not.toHaveBeenCalled();
  });
  it('blocks other batches, future and unavailable lectures before writing', async () => {
    const { prisma, service } = setup();
    prisma.scheduledSession.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.review(user, 'foreign-session', { understood: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.scheduledSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'foreign-session',
          offering: {
            batchId: 'batch-a',
            batch: { semester: { campusId: 'campus-a' } },
          },
          endsAt: { lte: expect.any(Date) },
        }),
      }),
    );
    expect(prisma.lectureReview.upsert).not.toHaveBeenCalled();
  });
  it('saves one editable review per student and lecture and clears obsolete explanations', async () => {
    const { prisma, service } = setup();
    await service.review(user, 'session-a', {
      understood: false,
      unclearTopics: '  Recursion  ',
    });
    expect(prisma.lectureReview.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId_scheduledSessionId: {
            studentProfileId: 'student-a',
            scheduledSessionId: 'session-a',
          },
        },
        update: { understood: false, unclearTopics: 'Recursion' },
      }),
    );
    await service.review(user, 'session-a', {
      understood: true,
      unclearTopics: 'old comment',
    });
    expect(prisma.lectureReview.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: { understood: true, unclearTopics: null },
      }),
    );
  });
});
