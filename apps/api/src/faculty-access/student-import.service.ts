import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UploadedImportFile } from '../semester-import/semester-import.types';
import { parseCsv } from '../semester-import/semester-import.parser';
import { buildCsv, csvBuffer } from '../export/export-csv';

type StudentRow = { row: number; name: string; campus: string; email: string };
const studentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  campus: z.string().trim().min(1),
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((s) => s.toLowerCase()),
});
export async function studentRows(file: UploadedImportFile) {
  if (!file?.buffer?.length || !/\.(xlsx|csv)$/i.test(file.originalname))
    throw new BadRequestException(
      'Choose an Excel (.xlsx) or CSV student file.',
    );
  let rows: string[][];
  try {
    if (/\.csv$/i.test(file.originalname))
      rows = parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer as never);
      const sheet =
        workbook.worksheets.find(
          (s) => s.name.trim().toLowerCase() === 'students',
        ) ??
        workbook.worksheets.find(
          (s) => !/^(read\s*me|instructions?|notes?)$/i.test(s.name.trim()),
        );
      if (!sheet) throw new Error('No student sheet');
      rows = [];
      for (let n = 1; n <= sheet.rowCount; n++) {
        const row = sheet.getRow(n);
        const cells: string[] = [];
        for (let c = 1; c <= row.cellCount; c++) {
          const cell = row.getCell(c);
          if (cell.type === ExcelJS.ValueType.Formula)
            throw new Error(`Row ${n}: replace formulas with student details.`);
          cells.push(cell.text.trim());
        }
        rows.push(cells);
      }
    }
  } catch (e) {
    throw new BadRequestException(
      e instanceof Error && e.message.startsWith('Row ')
        ? e.message
        : 'Could not read the student file. Use the Excel template or a CSV with Name, Campus and Email headings.',
    );
  }
  const headerIndex = rows.findIndex((r) => r.some((v) => v.trim()));
  const headers = (rows[headerIndex] ?? []).map((v) => v.trim().toLowerCase());
  const indexes = ['name', 'campus', 'email'].map((h) => headers.indexOf(h));
  if (
    indexes.includes(-1) ||
    new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length
  )
    throw new BadRequestException(
      'Use unique Name, Campus and Email column headings.',
    );
  const students: StudentRow[] = [],
    issues: { row: number; message: string }[] = [];
  const emails = new Set<string>();
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i]!;
    if (!cells.some((v) => v.trim())) continue;
    const parsed = studentSchema.safeParse({
      name: cells[indexes[0]!] ?? '',
      campus: cells[indexes[1]!] ?? '',
      email: cells[indexes[2]!] ?? '',
    });
    if (!parsed.success) {
      issues.push({
        row: i + 1,
        message: parsed.error.issues
          .map((e) => `${e.path[0]}: ${e.message}`)
          .join('; '),
      });
      continue;
    }
    if (emails.has(parsed.data.email)) {
      issues.push({
        row: i + 1,
        message: 'This email is repeated in the file.',
      });
      continue;
    }
    emails.add(parsed.data.email);
    students.push({ row: i + 1, ...parsed.data });
  }
  if (!students.length && !issues.length)
    issues.push({
      row: 0,
      message: 'Add at least one student below the headings.',
    });
  return { students, issues };
}
@Injectable()
export class StudentImportService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessPolicyService,
  ) {}
  private async campus(campusId: string, actor: AuthenticatedUser) {
    if (
      !actor.roles.some(
        (r) =>
          r.role === 'ADMIN' ||
          r.role === 'PROGRAM_MANAGER' ||
          (r.role === 'CAMPUS_MANAGER' && r.campusId === campusId),
      )
    )
      throw new ForbiddenException(
        'Only administrators, program managers and the assigned campus manager can manage student access.',
      );
    this.access.assertCanManageCampus(actor, campusId);
    const campus = await this.db.campus.findFirst({
      where: { id: campusId, active: true },
    });
    if (!campus) throw new BadRequestException('Choose an active campus.');
    return campus;
  }
  async template(
    campusId: string,
    actor: AuthenticatedUser,
    format: 'xlsx' | 'csv' = 'xlsx',
  ) {
    const campus = await this.campus(campusId, actor);
    if (format === 'csv') return csvBuffer('Name,Campus,Email\r\n');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Students');
    sheet.addRow(['Name', 'Campus', 'Email']);
    sheet.columns = [{ width: 32 }, { width: 32 }, { width: 45 }];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    book
      .addWorksheet('Read Me')
      .addRows([
        ['Fill in the Students sheet: one student per row.'],
        [`Campus must be ${campus.name} or ${campus.code}.`],
        [
          'Select the semester and batch in the app before uploading. All students in this upload join that batch.',
        ],
        [
          'Use student email addresses. After access is granted, students use Forgot password on the login page to verify their email and set their own password. They then sign in with that password and email verification.',
        ],
        [
          'Existing matching student accounts are skipped. Accounts with another role or batch are not changed.',
        ],
      ]);
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  async exportStudents(
    campusId: string,
    actor: AuthenticatedUser,
    format: 'xlsx' | 'csv',
  ) {
    const campus = await this.campus(campusId, actor);
    const students = await this.db.user.findMany({
      where: {
        roleAssignments: { some: { role: 'STUDENT', campusId } },
        studentProfile: { batch: { semester: { campusId } } },
      },
      select: {
        name: true,
        email: true,
        status: true,
        studentProfile: {
          select: {
            enrollmentStatus: true,
            batch: {
              select: { name: true, semester: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    const headings = [
      'Name',
      'Campus',
      'Email',
      'Semester',
      'Batch',
      'Account status',
      'Enrollment status',
    ];
    const rows = students.map((s) => [
      s.name,
      campus.name,
      s.email,
      s.studentProfile!.batch.semester.name,
      s.studentProfile!.batch.name,
      s.status,
      s.studentProfile!.enrollmentStatus,
    ]);
    let buffer: Buffer;
    if (format === 'csv') {
      buffer = csvBuffer(
        buildCsv(
          rows,
          headings.map((header, i) => ({
            header,
            value: (row: string[]) => row[i],
          })),
        ),
      );
    } else {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Students');
      sheet.addRow(headings);
      sheet.addRows(rows);
      sheet.columns = headings.map((h) => ({ width: h === 'Email' ? 42 : 28 }));
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: 'G1' };
      buffer = Buffer.from(await book.xlsx.writeBuffer());
    }
    await this.db.auditEvent.create({
      data: {
        actorId: actor.id,
        campusId,
        action: 'EXPORT',
        entityType: 'StudentAccess',
        entityId: campusId,
        metadata: { format, students: rows.length },
      },
    });
    return buffer;
  }
  async inspect(
    campusId: string,
    batchId: string,
    file: UploadedImportFile,
    actor: AuthenticatedUser,
    commit = false,
    fingerprint?: string,
  ) {
    const campus = await this.campus(campusId, actor);
    const batch = await this.db.batch.findFirst({
      where: {
        id: batchId,
        active: true,
        semester: { campusId, status: { not: 'ARCHIVED' } },
      },
    });
    if (!batch)
      throw new BadRequestException('Choose an active batch in this campus.');
    const { students, issues } = await studentRows(file);
    for (const row of students)
      if (
        ![campus.id, campus.name, campus.code].some(
          (c) => c.toLowerCase() === row.campus.toLowerCase(),
        )
      )
        issues.push({
          row: row.row,
          message: `Campus must match ${campus.name}.`,
        });
    const hash = createHash('sha256')
      .update(campusId)
      .update(batchId)
      .update(file.buffer)
      .digest('hex');
    if (commit && fingerprint !== hash)
      throw new ConflictException(
        'Preview this file and selected batch before confirming.',
      );
    return this.db
      .$transaction(
        async (tx) => {
          const existing = await tx.user.findMany({
            where: {
              email: { in: students.map((s) => s.email), mode: 'insensitive' },
            },
            include: { roleAssignments: true, studentProfile: true },
          });
          const rows = students.map((s) => {
            const current = existing.find(
              (u) => u.email.toLowerCase() === s.email,
            );
            const same =
              current?.status === 'ACTIVE' &&
              current.studentProfile?.batchId === batchId &&
              current.studentProfile.enrollmentStatus === 'ACTIVE' &&
              current.roleAssignments.length === 1 &&
              current.roleAssignments[0]?.role === 'STUDENT' &&
              current.roleAssignments[0]?.campusId === campusId;
            if (current && !same)
              issues.push({
                row: s.row,
                message: `${s.email} already has a different role, batch or inactive account. Review it in User access.`,
              });
            return {
              ...s,
              action: current
                ? same
                  ? 'Already has access'
                  : 'Needs review'
                : 'Create student',
            };
          });
          const pending = rows.filter((s) => s.action === 'Create student');
          const result = {
            valid: !issues.length,
            fingerprint: hash,
            rows,
            issues,
            createCount: pending.length,
            skipCount: rows.filter((s) => s.action === 'Already has access')
              .length,
            created: 0,
          };
          if (!commit || issues.length) return result;
          const users = pending.map((s) => ({
            id: randomUUID(),
            name: s.name,
            email: s.email,
            status: 'ACTIVE' as const,
          }));
          if (users.length) {
            await tx.user.createMany({ data: users });
            await tx.roleAssignment.createMany({
              data: users.map((u) => ({
                userId: u.id,
                role: 'STUDENT',
                campusId,
                scopeKey: campusId,
              })),
            });
            await tx.studentProfile.createMany({
              data: users.map((u) => ({
                userId: u.id,
                batchId,
                studentCode: `STU-${u.id}`,
                enrollmentStatus: 'ACTIVE',
              })),
            });
            await tx.auditEvent.create({
              data: {
                actorId: actor.id,
                campusId,
                action: 'IMPORT',
                entityType: 'StudentAccess',
                entityId: batchId,
                metadata: {
                  batchName: batch.name,
                  created: users.length,
                  students: users.map((u) => ({ id: u.id, name: u.name })),
                },
              },
            });
          }
          return { ...result, created: users.length };
        },
        { isolationLevel: 'Serializable', timeout: 30_000 },
      )
      .catch((error) => {
        if (error?.code === 'P2002' || error?.code === 'P2034')
          throw new ConflictException(
            'An account changed during this import. Preview again; no partial accounts were saved.',
          );
        throw error;
      });
  }
}
