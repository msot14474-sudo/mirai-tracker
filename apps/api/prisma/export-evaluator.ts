/** Export only the evaluator semesters recorded in the owner's private manifest. */
import { PrismaClient } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AccessPolicyService } from '../src/auth/access-policy.service';
import { VisitingFacultyService } from '../src/campus-data/visiting-faculty.service';
import { SemesterExportService } from '../src/campus-data/semester-export.service';
import { reportFile } from '../src/campus-data/campus-data.controller';
import { ReportsService } from '../src/reports/reports.service';
const db = new PrismaClient();
async function main() {
  const manifest = JSON.parse(
    await readFile(process.env.EVALUATOR_PRIVATE_OUTPUT!, 'utf8'),
  );
  const directory = process.env.EVALUATOR_EXPORT_DIRECTORY!;
  if (!directory) throw new Error('Set EVALUATOR_EXPORT_DIRECTORY.');
  await mkdir(directory, { recursive: true });
  const administrator = await db.user.findFirstOrThrow({
    where: { status: 'ACTIVE', roleAssignments: { some: { role: 'ADMIN' } } },
    include: { roleAssignments: true, staffProfile: true },
  });
  const user = {
    ...administrator,
    roles: administrator.roleAssignments,
    staffProfileId: administrator.staffProfile?.id ?? null,
  };
  const service = new SemesterExportService(
    db as any,
    new VisitingFacultyService(db as any, new AccessPolicyService(db as any)),
    new ReportsService(db as any),
  );
  for (const campus of manifest.campuses) {
    const semester = await db.semester.findUniqueOrThrow({
      where: { id: campus.semesterId },
    });
    if (!semester.name.startsWith('Evaluator Demo'))
      throw new Error(
        'Only evaluator semesters can be exported by this script.',
      );
    const started = Date.now();
    const sheets = await service.read(semester.id, user as any);
    for (const format of ['xlsx', 'csv'] as const) {
      await writeFile(
        join(directory, `${campus.code}_Demo_Semester.${format}`),
        await reportFile(sheets, format),
      );
    }
    console.log(
      JSON.stringify({
        campus: campus.code,
        elapsedMs: Date.now() - started,
        datasets: sheets.Contents,
      }),
    );
  }
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
