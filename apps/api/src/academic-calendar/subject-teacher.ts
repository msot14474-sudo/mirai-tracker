import { Prisma } from '@prisma/client';
/** Inherit the campus default only when an offering has no active teaching assignment. */
export async function inheritSubjectTeacher(
  tx: Prisma.TransactionClient,
  offeringId: string,
) {
  const offering = await tx.subjectOffering.findUnique({
    where: { id: offeringId },
    include: {
      batch: { include: { semester: true } },
      faculty: { where: { active: true } },
    },
  });
  if (!offering || offering.faculty.length) return;
  const campusId = offering.batch.semester.campusId;
  const teacher = await tx.subjectTeacher.findUnique({
    where: { subjectId_campusId: { subjectId: offering.subjectId, campusId } },
    include: {
      staffProfile: {
        include: { user: { include: { roleAssignments: true } } },
      },
    },
  });
  const staff = teacher?.staffProfile;
  if (
    !staff?.active ||
    staff.user.status !== 'ACTIVE' ||
    !staff.user.roleAssignments.some(
      (r) => r.role === 'FACULTY' && r.campusId === campusId,
    )
  )
    return;
  await tx.facultyAssignment.upsert({
    where: {
      offeringId_staffProfileId_startDate: {
        offeringId,
        staffProfileId: staff.id,
        startDate: offering.batch.semester.startDate,
      },
    },
    create: {
      offeringId,
      staffProfileId: staff.id,
      startDate: offering.batch.semester.startDate,
      endDate: offering.batch.semester.endDate,
      type: 'PRIMARY',
    },
    update: { active: true },
  });
}
