import ExcelJS from 'exceljs';
import { StudentImportService, studentRows } from './student-import.service';
import { ForbiddenException } from '@nestjs/common';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
const csv = (s: string) =>
  ({ originalname: 'students.csv', buffer: Buffer.from(s) }) as any;

describe('student files and campus authorization', () => {
  const campus = { id: 'campus-a', name: 'HI-Tech Campus', code: 'HI-TECH' };
  const actor = (
    role: 'ADMIN' | 'PROGRAM_MANAGER' | 'CAMPUS_MANAGER' | 'FACULTY',
    campusId: string | null = 'campus-a',
  ): AuthenticatedUser => ({
    id: 'actor-a',
    name: 'Manager',
    email: 'manager@example.edu',
    roles: [{ role, campusId }],
    staffProfileId: null,
    studentProfile: null,
  });
  const row = {
    name: '=Sample, Student',
    email: 'student@example.edu',
    status: 'ACTIVE',
    studentProfile: {
      enrollmentStatus: 'ACTIVE',
      batch: { name: 'First Year A', semester: { name: 'Semester 1' } },
    },
  };
  function setup() {
    const db = {
      campus: { findFirst: jest.fn().mockResolvedValue(campus) },
      user: { findMany: jest.fn().mockResolvedValue([row]) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    return {
      db,
      service: new StudentImportService(
        db as never,
        new AccessPolicyService(db as never),
      ),
    };
  }
  it.each(['ADMIN', 'PROGRAM_MANAGER', 'CAMPUS_MANAGER'] as const)(
    'allows %s to download student templates and a scoped CSV',
    async (role) => {
      const { service, db } = setup();
      const user = actor(role);
      expect(
        (await service.template('campus-a', user, 'csv')).toString(),
      ).toContain('Name,Campus,Email');
      const file = await service.exportStudents('campus-a', user, 'csv');
      expect(file.toString()).toContain(
        '"\'=Sample, Student",HI-Tech Campus,student@example.edu,Semester 1,First Year A,ACTIVE,ACTIVE',
      );
      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            roleAssignments: {
              some: { role: 'STUDENT', campusId: 'campus-a' },
            },
            studentProfile: { batch: { semester: { campusId: 'campus-a' } } },
          },
        }),
      );
      expect(db.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            campusId: 'campus-a',
            action: 'EXPORT',
          }),
        }),
      );
    },
  );
  it('blocks faculty and managers from another campus before reading or exporting students', async () => {
    const { service, db } = setup();
    for (const user of [
      actor('FACULTY'),
      actor('CAMPUS_MANAGER', 'campus-b'),
    ]) {
      await expect(
        service.template('campus-a', user, 'csv'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.exportStudents('campus-a', user, 'xlsx'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.auditEvent.create).not.toHaveBeenCalled();
  });
  it('writes an Excel export with campus and enrollment details as text cells', async () => {
    const { service } = setup();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      (await service.exportStudents(
        'campus-a',
        actor('PROGRAM_MANAGER', null),
        'xlsx',
      )) as never,
    );
    const sheet = book.getWorksheet('Students')!;
    expect(sheet.getCell('A2').text).toBe(row.name);
    expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('G2').text).toBe('ACTIVE');
  });
});
it('reads the Students sheet instead of Read Me and normalizes emails', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Read Me').addRow(['Instructions']);
  book.addWorksheet('Students').addRows([
    ['Name', 'Campus', 'Email'],
    ['Asha', 'HI-Tech', ' ASHA@example.edu '],
  ]);
  expect(
    await studentRows({
      originalname: 'students.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    } as any),
  ).toEqual({
    students: [
      { row: 2, name: 'Asha', campus: 'HI-Tech', email: 'asha@example.edu' },
    ],
    issues: [],
  });
});
it('reports every invalid or duplicate row and rejects missing columns', async () => {
  const result = await studentRows(
    csv(
      'Name,Campus,Email\nA,HI-Tech,a@example.edu\nB,HI-Tech,A@example.edu\nC,HI-Tech,invalid',
    ),
  );
  expect(result.issues.map((i) => i.row)).toEqual([3, 4]);
  await expect(studentRows(csv('Name,Campus\nA,HI-Tech'))).rejects.toThrow(
    'Email',
  );
});
