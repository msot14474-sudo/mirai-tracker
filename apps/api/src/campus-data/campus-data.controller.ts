import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { Roles, CurrentUser } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import {
  VisitingFacultyService,
  visitingRateSchema,
  visitingLedgerSchema,
} from './visiting-faculty.service';
import { SemesterBundleService } from './semester-bundle.service';
import { BundleRow } from './semester-bundle.parser';
import { buildCsv, csvBuffer } from '../export/export-csv';
import { SemesterExportService } from './semester-export.service';
import { ProgressService } from '../progress/progress.service';

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(result.error.issues.map((i) => i.message));
  return result.data;
}
function format(value?: string) {
  return parse(z.enum(['csv', 'xlsx']).default('xlsx'), value);
}
function download(data: Buffer, name: string, ext: 'csv' | 'xlsx') {
  return new StreamableFile(data, {
    type:
      ext === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    disposition: `attachment; filename="${name}.${ext}"`,
  });
}
export async function reportFile(
  sheets: Record<string, Record<string, unknown>[]>,
  ext: 'csv' | 'xlsx',
) {
  if (ext === 'csv') {
    const records = Object.entries(sheets).flatMap(([dataset, rows]) =>
      rows.map((r) => ({ dataset, ...r })),
    );
    const keys = [...new Set(records.flatMap(Object.keys))];
    return csvBuffer(
      buildCsv(
        records,
        keys.map((k) => ({
          header: k,
          value: (r: Record<string, unknown>) =>
            typeof r[k] === 'object'
              ? JSON.stringify(r[k])
              : String(r[k] ?? ''),
        })),
      ),
    );
  }
  const book = new ExcelJS.Workbook();
  for (const [name, records] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name);
    const keys = [...new Set(records.flatMap(Object.keys))];
    sheet.addRow(keys);
    for (const r of records)
      sheet.addRow(
        keys.map((k) =>
          typeof r[k] === 'object' ? JSON.stringify(r[k]) : (r[k] ?? ''),
        ),
      );
    sheet.getRow(1).font = { bold: true };
    sheet.columns?.forEach((c) => {
      c.width = 24;
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

@Controller('campus-data')
@Roles('ADMIN', 'PROGRAM_MANAGER', 'CAMPUS_MANAGER')
export class CampusDataController {
  constructor(
    private readonly visiting: VisitingFacultyService,
    private readonly bundle: SemesterBundleService,
    private readonly progress: ProgressService,
    private readonly semesterExport: SemesterExportService,
  ) {}
  @Get('semesters/:id/export')
  async exportSemester(
    @Param('id') id: string,
    @Query('format') value: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const ext = format(value);
    const sheets = await this.semesterExport.read(parse(uuidSchema, id), user);
    return download(await reportFile(sheets, ext), 'mirai-full-semester', ext);
  }
  @Get('semesters/:id/imports')
  history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bundle.history(parse(uuidSchema, id), user);
  }
  @Get('semesters/:id/imports/:importId/source')
  async source(
    @Param('id') id: string,
    @Param('importId') importId: string,
    @Query('format') value: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.bundle.source(
      parse(uuidSchema, id),
      parse(uuidSchema, importId),
      user,
    );
    const rows = data.sourceData as unknown as BundleRow[];
    const sheets: Record<string, Record<string, unknown>[]> = {};
    for (const r of rows)
      (sheets[r.dataset] ??= []).push({
        source_file: r.file,
        source_sheet: r.sheet,
        source_row: r.row,
        ...r.original,
      });
    const ext = format(value);
    return download(await reportFile(sheets, ext), 'mirai-import-source', ext);
  }
  @Get('semesters/:id/analysis')
  async analysis(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const sem = await this.visiting.semester(parse(uuidSchema, id), user);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: sem.campus.timezone,
    }).format(new Date());
    const data = await this.progress.list(today, user, sem.campusId);
    return { subjects: data.subjects.filter((s) => s.semester.id === sem.id) };
  }
  @Get('semesters/:id/visiting-faculty')
  visitingDashboard(
    @Param('id') id: string,
    @Query('month') month: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visiting.dashboard(
      parse(uuidSchema, id),
      user,
      month || undefined,
    );
  }
  @Post('semesters/:id/visiting-faculty/rates')
  rate(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visiting.saveRate(
      parse(uuidSchema, id),
      parse(visitingRateSchema, body),
      user,
    );
  }
  @Post('semesters/:id/visiting-faculty/ledger')
  ledger(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visiting.addLedger(
      parse(uuidSchema, id),
      parse(visitingLedgerSchema, body),
      user,
    );
  }
  @Delete('semesters/:id/visiting-faculty/ledger/:entryId')
  void(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visiting.voidLedger(
      parse(uuidSchema, id),
      parse(uuidSchema, entryId),
      user,
    );
  }
  @Get('semesters/:id/visiting-faculty/report')
  async report(
    @Param('id') id: string,
    @Query('month') month: string | undefined,
    @Query('format') value: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.visiting.dashboard(
        parse(uuidSchema, id),
        user,
        month || undefined,
      ),
      ext = format(value);
    const sheets = {
      Summary: [
        {
          semester: data.semester.name,
          campus: data.semester.campus,
          currency: data.currency,
          month: data.month ?? 'Full semester',
          ...data.summary,
          unresolvedClasses: data.unresolvedClasses,
        },
      ],
      Faculty: data.faculty.map((f) => ({
        ...f,
        subjects: f.subjects.map((s) => `${s.code} / ${s.batch}`).join(' | '),
        rates: JSON.stringify(f.rates),
      })),
      Classes: data.classes,
      Ledger: data.ledger,
    };
    return download(
      await reportFile(sheets, ext),
      'mirai-visiting-faculty',
      ext,
    );
  }
}
