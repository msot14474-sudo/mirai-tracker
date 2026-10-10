import ExcelJS from 'exceljs';
import {
  parseAndValidateSemesterImport,
  parseCsv,
} from './semester-import.parser';
import {
  buildSemesterImportCsv,
  buildSemesterImportWorkbook,
  demoSetupRows,
} from './semester-import.template';
import { calendarColumns, setupColumns } from './semester-import.types';

describe('semester import parser', () => {
  it('validates the ready-to-import CSV with three campuses and 25 subjects', async () => {
    const source = buildSemesterImportCsv();
    const preview = await parseAndValidateSemesterImport(
      uploaded('semester.csv', Buffer.from(source)),
    );

    expect(preview.valid).toBe(true);
    expect(preview.counts).toMatchObject({
      rows: 25,
      campuses: 3,
      semesters: 3,
      batches: 3,
      subjects: 25,
      offerings: 25,
    });
  });

  it('validates the Excel workbook and its Calendar sheet', async () => {
    const source = await buildSemesterImportWorkbook();
    const preview = await parseAndValidateSemesterImport(
      uploaded('semester.xlsx', source),
    );

    expect(preview.valid).toBe(true);
    expect(preview.counts.campuses).toBe(3);
    expect(preview.counts.subjects).toBe(25);
    expect(preview.counts.calendarDays).toBe(6);
  });

  it('returns exact missing-column feedback', async () => {
    const source = 'campus_code,campus_name\nHI-TECH,HI-Tech Campus';
    const preview = await parseAndValidateSemesterImport(
      uploaded('semester.csv', Buffer.from(source)),
    );

    expect(preview.valid).toBe(false);
    expect(preview.counts.rows).toBe(1);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({
        rowNumber: 1,
        columnName: 'semester_name',
        errorMessage: 'Required column "semester_name" is missing.',
      }),
    );
  });

  it('rejects a duplicate subject offering in the same file', async () => {
    const lines = buildSemesterImportCsv().split('\r\n');
    lines.push(lines[1]!);
    const preview = await parseAndValidateSemesterImport(
      uploaded('semester.csv', Buffer.from(lines.join('\r\n'))),
    );

    expect(preview.valid).toBe(false);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({
        rowNumber: 27,
        columnName: 'subject_code',
        errorMessage: 'This batch and subject offering appears more than once.',
      }),
    );
  });

  it('rejects inconsistent campus details for the same code', async () => {
    const rows = demoSetupRows().slice(0, 2);
    rows[1]![0] = rows[0]![0]!;
    rows[1]![1] = 'A different campus name';
    const source = [setupColumns, ...rows]
      .map((row) => row.join(','))
      .join('\r\n');
    const preview = await parseAndValidateSemesterImport(
      uploaded('semester.csv', Buffer.from(source)),
    );

    expect(preview.issues).toContainEqual(
      expect.objectContaining({
        rowNumber: 3,
        columnName: 'campus_code',
        errorMessage: 'Campus code is repeated with different campus details.',
      }),
    );
  });

  it('rejects a calendar date outside the referenced semester', async () => {
    const workbook = await customWorkbook([
      [
        'HI-TECH',
        'Sample Semester 2026',
        '2027-01-01',
        'HOLIDAY',
        'Outside',
        'false',
        '',
      ],
    ]);
    const preview = await parseAndValidateSemesterImport(
      uploaded('semester.xlsx', workbook),
    );

    expect(preview.valid).toBe(false);
    expect(preview.issues).toContainEqual(
      expect.objectContaining({
        sheet: 'Calendar',
        columnName: 'date',
        errorMessage: 'Calendar date must be inside the semester.',
      }),
    );
  });

  it('does not accept spreadsheet formulas as imported text', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Semester Setup');
    sheet.addRow([...setupColumns]);
    const row = sheet.addRow(demoSetupRows()[0]);
    row.getCell(2).value = { formula: 'CONCAT("Campus")', result: 'Campus' };
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const preview = await parseAndValidateSemesterImport(
      uploaded('semester.xlsx', bytes),
    );

    expect(preview.issues).toContainEqual(
      expect.objectContaining({
        columnName: 'campus_name',
        errorMessage: 'Spreadsheet formulas are not allowed.',
      }),
    );
  });

  it('parses quoted CSV values, escaped quotes and embedded newlines', () => {
    expect(
      parseCsv('a,b\r\n"one, two","say ""hello"""\r\n"line\nnext",ok'),
    ).toEqual([
      ['a', 'b'],
      ['one, two', 'say "hello"'],
      ['line\nnext', 'ok'],
    ]);
  });

  it('rejects files over five megabytes before parsing', async () => {
    const preview = await parseAndValidateSemesterImport({
      ...uploaded('semester.csv', Buffer.from('x')),
      size: 5 * 1024 * 1024 + 1,
    });
    expect(preview.issues[0]?.errorMessage).toBe('Maximum file size is 5 MB.');
  });
});

function uploaded(originalname: string, buffer: Buffer) {
  return {
    originalname,
    mimetype: 'application/octet-stream',
    size: buffer.length,
    buffer,
  };
}

async function customWorkbook(calendarRows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  const setup = workbook.addWorksheet('Semester Setup');
  setup.addRow([...setupColumns]);
  setup.addRow(demoSetupRows()[0]);
  const calendar = workbook.addWorksheet('Calendar');
  calendar.addRow([...calendarColumns]);
  calendar.addRows(calendarRows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
