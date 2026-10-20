import { StudentViewService } from '../src/student-view/student-view.service';
import { FacultyAccessService } from '../src/faculty-access/faculty-access.service';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { PrismaService } from '../src/database/prisma.service';
import { AccessPolicyService } from '../src/auth/access-policy.service';
import { AcademicCalendarService } from '../src/academic-calendar/academic-calendar.service';
import { StudentImportService } from '../src/faculty-access/student-import.service';
import { SemesterExportService } from '../src/campus-data/semester-export.service';
import { VisitingFacultyService } from '../src/campus-data/visiting-faculty.service';
import { ReportsService } from '../src/reports/reports.service';
import { ReportDocumentService } from '../src/reports/report-document.service';
import { reportQuerySchema } from '../src/reports/reports.schemas';
import { reportFile } from '../src/campus-data/campus-data.controller';

it('keeps campus management, bulk access, calendar edits and complete exports linked and scoped', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.includes('reports_test')
  )
    throw new Error('Dedicated local database required');
  const prisma = new PrismaService();
  const rollback = new Error('ROLLBACK');
  try {
    await prisma.$transaction(
      async (tx) => {
        const db: any = new Proxy(tx, {
          get(target, key) {
            return key === '$transaction'
              ? (fn: any) => fn(tx)
              : (target as any)[key];
          },
        });
        const tag = randomUUID().slice(0, 8);
        const campus = await tx.campus.create({
          data: { code: `own-${tag}`, name: 'Own campus' },
        });
        const foreign = await tx.campus.create({
          data: { code: `other-${tag}`, name: 'Empty Rathinam campus' },
        });
        const record = await tx.user.create({
          data: {
            name: 'Manager',
            email: `manager-${tag}@example.test`,
            status: 'ACTIVE',
          },
        });
        const manager: any = {
          ...record,
          roles: [{ role: 'CAMPUS_MANAGER', campusId: campus.id }],
          staffProfileId: null,
        };
        const admin: any = {
          ...manager,
          roles: [{ role: 'ADMIN', campusId: null }],
        };
        const faculty: any = {
          ...manager,
          roles: [{ role: 'FACULTY', campusId: campus.id }],
        };
        const semester = await tx.semester.create({
          data: {
            campusId: campus.id,
            name: 'Semester test',
            startDate: new Date('2026-07-01'),
            endDate: new Date('2026-12-31'),
            workingSaturdayRule: 'SECOND_AND_FOURTH',
            status: 'ACTIVE',
          },
        });
        const otherSemester = await tx.semester.create({
          data: {
            campusId: foreign.id,
            name: 'Private semester',
            startDate: semester.startDate,
            endDate: semester.endDate,
          },
        });
        const access = new AccessPolicyService(db);
        const regenerateSemester = jest.fn().mockResolvedValue(undefined);
        const calendar = new AcademicCalendarService(db, access, {
          regenerateSemester,
        } as any);
        const subject = await calendar.createSubject(
          {
            campusId: campus.id,
            semesterId: semester.id,
            batchCode: 'A',
            batchName: 'First Year A',
            trackCode: 'MIRAI',
            trackName: 'Mirai',
            code: `M-${tag}`,
            name: 'Web',
            description: null,
          },
          manager,
        );
        const batch = await tx.batch.findFirstOrThrow({
          where: { semesterId: semester.id },
        });
        await calendar.createSubject(
          {
            campusId: campus.id,
            semesterId: semester.id,
            batchId: batch.id,
            trackCode: 'UNIVERSITY',
            trackName: 'University',
            code: `U-${tag}`,
            name: 'Math',
            description: null,
          },
          manager,
        );
        expect(
          (await tx.subjectOffering.findMany({ where: { batchId: batch.id } }))
            .map((s) => s.academicTrack)
            .sort(),
        ).toEqual(['MIRAI', 'UNIVERSITY']);
        await expect(
          calendar.createSubject(
            {
              campusId: foreign.id,
              code: 'BAD',
              name: 'Bad',
              description: null,
            },
            manager,
          ),
        ).rejects.toThrow();
        const day = await calendar.createCalendarDay(
          semester.id,
          {
            date: '2026-08-15',
            title: 'Holiday',
            type: 'HOLIDAY',
            teachingAllowed: false,
          },
          manager,
        );
        await calendar.updateCalendarDay(
          day.id,
          {
            type: 'EXTRA_WORKING_DAY',
            title: 'Teaching day',
            teachingAllowed: false,
          },
          manager,
        );
        expect(
          (
            await tx.calendarDayOverride.findUniqueOrThrow({
              where: { id: day.id },
            })
          ).teachingAllowed,
        ).toBe(true);
        await expect(
          calendar.createCalendarDay(
            otherSemester.id,
            {
              date: '2026-08-15',
              title: 'Bad',
              type: 'HOLIDAY',
              teachingAllowed: false,
            },
            manager,
          ),
        ).rejects.toThrow();
        const exam = await calendar.createExamWindow(
          semester.id,
          {
            name: 'Mid-term',
            type: 'MID_TERM',
            startDate: '2026-10-05',
            endDate: '2026-10-06',
            syllabusDeadline: '2026-10-04',
          },
          manager,
        );
        await tx.calendarDayOverride.createMany({
          data: [5, 6].map((d) => ({
            semesterId: semester.id,
            date: new Date(`2026-10-0${d}`),
            title: 'Mid-term',
            type: 'EVENT' as const,
            teachingAllowed: false,
          })),
        });
        await calendar.updateExamWindow(
          exam.id,
          {
            startDate: '2026-10-12',
            endDate: '2026-10-13',
            syllabusDeadline: '2026-10-11',
          },
          manager,
        );
        expect(
          (
            await tx.calendarDayOverride.findMany({
              where: { semesterId: semester.id, title: 'Mid-term' },
              orderBy: { date: 'asc' },
            })
          ).map((d) => d.date.toISOString().slice(0, 10)),
        ).toEqual(['2026-10-12', '2026-10-13']);
        await tx.calendarDayOverride.create({
          data: {
            semesterId: semester.id,
            date: new Date('2026-10-20'),
            title: 'Independent holiday',
            type: 'HOLIDAY',
            teachingAllowed: false,
          },
        });
        await expect(
          calendar.updateExamWindow(
            exam.id,
            {
              startDate: '2026-10-20',
              endDate: '2026-10-21',
              syllabusDeadline: '2026-10-19',
            },
            manager,
          ),
        ).rejects.toThrow();
        expect(
          (
            await tx.examWindow.findUniqueOrThrow({ where: { id: exam.id } })
          ).startDate
            .toISOString()
            .slice(0, 10),
        ).toBe('2026-10-12');
        expect(regenerateSemester).toHaveBeenCalledWith(semester.id, manager);
        const students = new StudentImportService(db, access);
        const file: any = {
          originalname: 'students.csv',
          buffer: Buffer.from(
            `Name,Campus,Email\nStudent One,Own campus,one-${tag}@example.test\nStudent Two,Own campus,two-${tag}@example.test`,
          ),
        };
        const preview = await students.inspect(
          campus.id,
          batch.id,
          file,
          manager,
        );
        expect(preview).toMatchObject({
          valid: true,
          createCount: 2,
          created: 0,
        });
        await expect(
          students.inspect(campus.id, batch.id, file, manager, true, 'wrong'),
        ).rejects.toThrow();
        expect(
          await students.inspect(
            campus.id,
            batch.id,
            file,
            manager,
            true,
            preview.fingerprint,
          ),
        ).toMatchObject({ created: 2 });
        expect(
          await students.inspect(campus.id, batch.id, file, manager),
        ).toMatchObject({ createCount: 0, skipCount: 2 });
        const imported = await tx.user.findFirstOrThrow({
          where: { email: `one-${tag}@example.test` },
          include: { roleAssignments: true, studentProfile: true },
        });
        expect(imported.roleAssignments).toHaveLength(1);
        expect(imported.roleAssignments[0]).toMatchObject({
          role: 'STUDENT',
          campusId: campus.id,
        });
        expect(imported.studentProfile?.batchId).toBe(batch.id);
        const studentView = new StudentViewService(db);
        const student: any = {
          ...imported,
          roles: imported.roleAssignments,
          staffProfileId: null,
        };
        const home = await studentView.overview('2026-10-20', student);
        expect(home.batch.semester.campus.id).toBe(campus.id);
        expect(home.subjects.map((s) => s.subject.name).sort()).toEqual([
          'Math',
          'Web',
        ]);
        await expect(
          studentView.overview('2026-10-20', {
            ...student,
            roles: [{ role: 'STUDENT', campusId: foreign.id }],
          }),
        ).rejects.toThrow();
        await tx.studentProfile.update({
          where: { userId: imported.id },
          data: { enrollmentStatus: 'WITHDRAWN' },
        });
        await expect(
          studentView.overview('2026-10-20', student),
        ).rejects.toThrow();
        await tx.studentProfile.update({
          where: { userId: imported.id },
          data: { enrollmentStatus: 'ACTIVE' },
        });
        const unlinked = await tx.user.create({
          data: {
            name: 'Unlinked sample student',
            email: `unlinked-${tag}@example.test`,
            status: 'ACTIVE',
            roleAssignments: {
              create: {
                role: 'STUDENT',
                campusId: campus.id,
                scopeKey: campus.id,
              },
            },
          },
        });
        const accounts = new FacultyAccessService(db, access);
        await accounts.updateAccount(
          unlinked.id,
          { studentBatchId: batch.id },
          manager,
        );
        const linkedProfile = await tx.studentProfile.findUniqueOrThrow({
          where: { userId: unlinked.id },
        });
        expect(linkedProfile.batchId).toBe(batch.id);
        const foreignBatch = await tx.batch.create({
          data: {
            semesterId: otherSemester.id,
            trackId: batch.trackId,
            name: 'Other batch',
            code: 'OTHER',
          },
        });
        await expect(
          accounts.updateAccount(
            unlinked.id,
            { studentBatchId: foreignBatch.id },
            admin,
          ),
        ).rejects.toThrow('assigned campus');
        expect(
          (
            await tx.studentProfile.findUniqueOrThrow({
              where: { userId: unlinked.id },
            })
          ).batchId,
        ).toBe(batch.id);

        const bad: any = {
          originalname: 'bad.csv',
          buffer: Buffer.from(
            `Name,Campus,Email\nGood,Own campus,good-${tag}@example.test\nWrong,Another campus,wrong-${tag}@example.test`,
          ),
        };
        const invalid = await students.inspect(
          campus.id,
          batch.id,
          bad,
          manager,
        );
        expect(
          await students.inspect(
            campus.id,
            batch.id,
            bad,
            manager,
            true,
            invalid.fingerprint,
          ),
        ).toMatchObject({ valid: false, created: 0 });
        expect(
          await tx.user.findUnique({
            where: { email: `good-${tag}@example.test` },
          }),
        ).toBeNull();
        await expect(
          students.inspect(foreign.id, batch.id, file, manager),
        ).rejects.toThrow();
        await expect(
          students.inspect(campus.id, batch.id, file, faculty),
        ).rejects.toThrow();
        const reports = new ReportsService(db);
        expect(
          (
            await reports.read(admin, reportQuerySchema.parse({}))
          ).availableCampuses.map((c) => c.id),
        ).toContain(foreign.id);
        expect(
          (
            await reports.read(manager, reportQuerySchema.parse({}))
          ).availableCampuses.map((c) => c.id),
        ).toEqual([campus.id]);
        const exporter = new SemesterExportService(
          db,
          new VisitingFacultyService(db, access),
          reports,
        );
        const sheets = await exporter.read(semester.id, manager);
        expect(sheets.Calendar).toHaveLength(184);
        expect(sheets.Subjects).toHaveLength(2);
        expect(sheets['Lecture logs']).toHaveLength(0);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load((await reportFile(sheets, 'xlsx')) as never);
        expect(workbook.getWorksheet('Subjects')!.rowCount).toBe(3);
        expect(workbook.getWorksheet('Calendar')!.rowCount).toBe(185);
        expect((await reportFile(sheets, 'csv')).toString()).toContain(
          'University',
        );
        await expect(
          exporter.read(otherSemester.id, manager),
        ).rejects.toThrow();
        await expect(exporter.read(semester.id, faculty)).rejects.toThrow();
        const docs = new ReportDocumentService(reports, {
          configuration: () => ({ ready: false }),
        } as any);
        const document = await docs.generate(
          manager,
          reportQuerySchema.parse({ semesterId: semester.id }),
        );
        expect(document.content.toString()).toContain(
          'Recorded syllabus coverage',
        );
        expect(document.content.toString()).not.toContain(
          'Empty Rathinam campus',
        );
        expect(document.content.toString()).toContain(
          'AI analysis was unavailable',
        );
        expect(document.content.toString()).toContain(subject.name);
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (e) {
    if (e !== rollback) throw e;
  } finally {
    await prisma.$disconnect();
  }
}, 40000);
