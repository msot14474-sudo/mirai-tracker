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

/** Batch inheritance avoids one set of remote queries per selected subject. */
export async function inheritSubjectTeachers(
  tx: Prisma.TransactionClient,
  offeringIds: string[],
) {
  if (!offeringIds.length) return;
  const offerings = await tx.subjectOffering.findMany({
    where: {
      id: { in: offeringIds },
      status: { not: 'ARCHIVED' },
      faculty: { none: { active: true } },
    },
    select: {
      id: true,
      subjectId: true,
      batch: {
        select: {
          semester: {
            select: { campusId: true, startDate: true, endDate: true },
          },
        },
      },
    },
  });
  if (!offerings.length) return;
  const defaults = await tx.subjectTeacher.findMany({
    where: {
      OR: offerings.map((offering) => ({
        subjectId: offering.subjectId,
        campusId: offering.batch.semester.campusId,
      })),
    },
    select: {
      subjectId: true,
      campusId: true,
      staffProfile: {
        select: {
          id: true,
          active: true,
          user: {
            select: {
              status: true,
              roleAssignments: { select: { role: true, campusId: true } },
            },
          },
        },
      },
    },
  });
  const assignments: Prisma.FacultyAssignmentCreateManyInput[] = [];
  for (const offering of offerings) {
    const semester = offering.batch.semester;
    const staff = defaults.find(
      (teacher) =>
        teacher.subjectId === offering.subjectId &&
        teacher.campusId === semester.campusId,
    )?.staffProfile;
    if (
      !staff?.active ||
      staff.user.status !== 'ACTIVE' ||
      !staff.user.roleAssignments.some(
        (role) =>
          role.role === 'FACULTY' && role.campusId === semester.campusId,
      )
    )
      continue;
    assignments.push({
      offeringId: offering.id,
      staffProfileId: staff.id,
      startDate: semester.startDate,
      endDate: semester.endDate,
      type: 'PRIMARY',
    });
  }
  if (!assignments.length) return;
  await tx.facultyAssignment.createMany({
    data: assignments,
    skipDuplicates: true,
  });
  // Restore a previous inactive default assignment without touching co-teachers.
  await tx.facultyAssignment.updateMany({
    where: {
      active: false,
      OR: assignments.map(({ offeringId, staffProfileId, startDate }) => ({
        offeringId,
        staffProfileId,
        startDate,
      })),
    },
    data: { active: true },
  });
}
