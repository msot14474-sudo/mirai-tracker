import { AcademicCalendarService } from './academic-calendar.service';
import { inheritSubjectTeacher } from './subject-teacher';
const actor = { id: 'admin' } as any;
function fixture() {
  const tx: any = {
    subject: {
      findFirst: jest.fn().mockResolvedValue({ id: 'subject' }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'subject', offerings: [], teachers: [] }),
    },
    staffProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'teacher' }) },
    subjectTeacher: { upsert: jest.fn() },
    subjectOffering: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'offering' }),
    },
    facultyAssignment: { upsert: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const db: any = { $transaction: (fn: any) => fn(tx) };
  const access = { assertCanManageCampus: jest.fn() };
  return {
    tx,
    access,
    service: new AcademicCalendarService(db, access as any, {} as any),
  };
}
it('saves a campus-specific default when the subject is linked to a batch', async () => {
  const { service, tx } = fixture();
  await service.assignSubjectTeacher(
    'subject',
    { campusId: 'campus', staffProfileId: 'teacher' },
    actor,
  );
  expect(tx.subjectTeacher.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        subjectId_campusId: { subjectId: 'subject', campusId: 'campus' },
      },
    }),
  );
  expect(tx.staffProfile.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        active: true,
        user: {
          status: 'ACTIVE',
          roleAssignments: { some: { role: 'FACULTY', campusId: 'campus' } },
        },
      }),
    }),
  );
});
it('rejects inaccessible campuses, foreign subjects and inactive or foreign faculty', async () => {
  const a = fixture();
  a.access.assertCanManageCampus.mockImplementation(() => {
    throw new Error('Forbidden');
  });
  await expect(
    a.service.assignSubjectTeacher(
      's',
      { campusId: 'c', staffProfileId: 't' },
      actor,
    ),
  ).rejects.toThrow('Forbidden');
  const b = fixture();
  b.tx.subject.findFirst.mockResolvedValue(null);
  await expect(
    b.service.assignSubjectTeacher(
      's',
      { campusId: 'c', staffProfileId: 't' },
      actor,
    ),
  ).rejects.toThrow('Subject not found');
  const c = fixture();
  c.tx.staffProfile.findFirst.mockResolvedValue(null);
  await expect(
    c.service.assignSubjectTeacher(
      's',
      { campusId: 'c', staffProfileId: 't' },
      actor,
    ),
  ).rejects.toThrow('active faculty');
  expect(c.tx.subjectTeacher.upsert).not.toHaveBeenCalled();
});
it('checks offering ownership before assigning teaching access', async () => {
  const { service, tx } = fixture();
  tx.subjectOffering.findFirst.mockResolvedValue(null);
  await expect(
    service.assignSubjectTeacher(
      's',
      { campusId: 'c', staffProfileId: 't', offeringId: 'other' },
      actor,
    ),
  ).rejects.toThrow('batch does not belong');
  expect(tx.facultyAssignment.upsert).not.toHaveBeenCalled();
});
it('inherits defaults for new offerings but preserves teachers already assigned', async () => {
  const tx: any = {
    subjectOffering: {
      findUnique: jest.fn().mockResolvedValue({
        subjectId: 'subject',
        faculty: [],
        batch: {
          semester: {
            campusId: 'campus',
            startDate: new Date('2026-09-01'),
            endDate: new Date('2026-12-31'),
          },
        },
      }),
    },
    subjectTeacher: {
      findUnique: jest.fn().mockResolvedValue({
        staffProfile: {
          id: 'teacher',
          active: true,
          user: {
            status: 'ACTIVE',
            roleAssignments: [{ role: 'FACULTY', campusId: 'campus' }],
          },
        },
      }),
    },
    facultyAssignment: { upsert: jest.fn() },
  };
  await inheritSubjectTeacher(tx, 'offering');
  expect(tx.facultyAssignment.upsert).toHaveBeenCalledTimes(1);
  tx.subjectOffering.findUnique.mockResolvedValue({
    faculty: [{ id: 'existing' }],
  });
  await inheritSubjectTeacher(tx, 'offering');
  expect(tx.facultyAssignment.upsert).toHaveBeenCalledTimes(1);
});

it('rejects a default-only assignment when the semester batch is missing', async () => {
  const { service, tx } = fixture();
  tx.subjectOffering.findFirst.mockResolvedValue(null);
  await expect(
    service.assignSubjectTeacher(
      'subject',
      { campusId: 'campus', staffProfileId: 'teacher' },
      actor,
    ),
  ).rejects.toThrow('Link this subject to a semester and batch');
  expect(tx.subjectTeacher.upsert).not.toHaveBeenCalled();
});

it('returns the linked subject immediately after assigning a teacher to a batch', async () => {
  const { service, tx } = fixture();
  const startDate = new Date('2026-08-01');
  const endDate = new Date('2026-12-31');
  tx.subjectOffering.findFirst.mockResolvedValue({
    id: 'offering',
    batch: { semester: { startDate, endDate } },
  });
  const saved = {
    id: 'subject',
    offerings: [
      {
        id: 'offering',
        faculty: [{ staffProfile: { id: 'teacher', user: { name: 'Asha' } } }],
      },
    ],
  };
  tx.subject.findUniqueOrThrow.mockResolvedValue(saved);
  await expect(
    service.assignSubjectTeacher(
      'subject',
      { campusId: 'campus', staffProfileId: 'teacher', offeringId: 'offering' },
      actor,
    ),
  ).resolves.toEqual({ assigned: true, subject: saved });
  expect(tx.facultyAssignment.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        offeringId: 'offering',
        staffProfileId: 'teacher',
        startDate,
        endDate,
      }),
    }),
  );
  expect(tx.subject.findUniqueOrThrow).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({
        offerings: expect.objectContaining({
          where: expect.objectContaining({
            batch: { semester: { campusId: 'campus' } },
          }),
        }),
      }),
    }),
  );
});

it('returns the new subject with its semester and batch after the atomic create', async () => {
  const { service, tx, access } = fixture();
  Object.assign(access, { assertGlobalManager: jest.fn() });
  tx.semester = {
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: 'semester', campusId: 'campus' }),
  };
  tx.subject.create = jest
    .fn()
    .mockResolvedValue({ id: 'subject', name: 'Math' });
  const linked = {
    id: 'subject',
    name: 'Math',
    offerings: [
      {
        id: 'offering',
        batch: { name: 'First Year A', semester: { name: 'Semester 1' } },
        faculty: [],
      },
    ],
    teachers: [],
  };
  const link = jest
    .spyOn(service as any, 'linkSemesterSubjects')
    .mockImplementation(async () => {
      tx.subject.findUniqueOrThrow.mockResolvedValue(linked);
    });
  await expect(
    service.createSubject(
      {
        campusId: 'campus',
        semesterId: 'semester',
        batchId: 'batch',
        code: 'M',
        name: 'Math',
        description: null,
      },
      actor,
    ),
  ).resolves.toEqual(linked);
  expect(link).toHaveBeenCalledWith(
    tx,
    'semester',
    expect.objectContaining({ subjectIds: ['subject'], batchId: 'batch' }),
    actor,
  );
});
