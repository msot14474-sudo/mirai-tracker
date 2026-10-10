import ExcelJS from 'exceljs';
import { calendarColumns, setupColumns } from './semester-import.types';

const campuses = [
  { code: 'HI-TECH', name: 'HI-Tech Campus' },
  { code: 'RATHINAM', name: 'Rathinam Campus' },
  { code: 'JAGGANNATH', name: 'Jaggannath Campus' },
] as const;

const subjectNames = [
  'Foundations of Occupational Therapy',
  'Human Anatomy',
  'Human Physiology',
  'Biochemistry',
  'Psychology',
  'Sociology',
  'Pathology',
  'Microbiology',
  'Pharmacology',
  'Biomechanics',
  'Kinesiology',
  'Therapeutic Activities',
  'Clinical Neurology',
  'Orthopaedic Rehabilitation',
  'Paediatric Rehabilitation',
  'Mental Health Practice',
  'Community Rehabilitation',
  'Assistive Technology',
  'Research Methods',
  'Biostatistics',
  'Ergonomics',
  'Professional Ethics',
  'Clinical Documentation',
  'Evidence Based Practice',
  'Fieldwork Seminar',
] as const;

export function demoSetupRows(): string[][] {
  return subjectNames.map((subjectName, index) => {
    const campus = campuses[index % campuses.length]!;
    return [
      campus.code,
      campus.name,
      'Asia/Kolkata',
      'Sample Semester 2026',
      '2026-07-01',
      '2026-12-20',
      'SECOND_AND_FOURTH',
      '1.15',
      '1.00',
      'MSOT',
      'Master of Occupational Therapy',
      `MSOT-2026-${campus.code}`,
      `MSOT 2026 · ${campus.name}`,
      `MSOT${String(index + 1).padStart(3, '0')}`,
      subjectName,
      'Fictional demonstration subject',
      '2026-12-04',
    ];
  });
}

export function demoCalendarRows(): string[][] {
  return campuses.flatMap((campus) => [
    [
      campus.code,
      'Sample Semester 2026',
      '2026-08-15',
      'HOLIDAY',
      'Independence Day',
      'false',
      'National holiday',
    ],
    [
      campus.code,
      'Sample Semester 2026',
      '2026-11-08',
      'EXTRA_WORKING_DAY',
      'Academic Recovery Day',
      'true',
      'Fictional recovery day',
    ],
  ]);
}

export function buildSemesterImportCsv() {
  return [setupColumns, ...demoSetupRows()]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

export async function buildSemesterImportWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mirai Course Progression Tracker';
  workbook.created = new Date('2026-10-07T00:00:00.000Z');

  const instructions = workbook.addWorksheet('Instructions');
  instructions.addRows([
    ['M05 · Full semester import'],
    ['Upload this workbook from the Semester import workspace.'],
    [
      'Keep column names unchanged. Dates use YYYY-MM-DD. Codes use uppercase letters, numbers, hyphens or underscores.',
    ],
    [
      'The supplied fictional data is valid and demonstrates three campuses and 25 subjects.',
    ],
    ['The whole workbook is validated before any academic record is written.'],
  ]);
  instructions.getColumn(1).width = 110;
  instructions.getRow(1).font = { bold: true, size: 16 };

  const setup = workbook.addWorksheet('Semester Setup');
  setup.addRow([...setupColumns]);
  setup.addRows(demoSetupRows());
  styleDataSheet(setup);

  const calendar = workbook.addWorksheet('Calendar');
  calendar.addRow([...calendarColumns]);
  calendar.addRows(demoCalendarRows());
  styleDataSheet(calendar);

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

function styleDataSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(1, sheet.columnCount) },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1C5A49' },
  };
  sheet.columns.forEach((column) => {
    column.width = Math.min(
      34,
      Math.max(
        14,
        ...(column.values ?? [])
          .slice(1)
          .map((value) => String(value ?? '').length + 2),
      ),
    );
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
