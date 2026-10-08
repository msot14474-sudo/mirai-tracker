import { CalendarDayType, WorkingSaturdayRule } from '@prisma/client';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { isoDateSchema } from '../academic-calendar/academic-calendar.schemas';
import {
  CalendarImportRow,
  ImportCounts,
  ImportIssue,
  SemesterImportData,
  SemesterImportPreview,
  SemesterSetupRow,
  UploadedImportFile,
  calendarColumns,
  setupColumns,
} from './semester-import.types';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5_000;
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Use uppercase letters, numbers, - or _.');
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/^[=+@]/.test(value), {
      message: 'Spreadsheet formulas are not allowed.',
    });
const optionalNumber = (fallback: number) =>
  z.preprocess(
    (value) => (value === '' || value == null ? fallback : Number(value)),
    z.number().positive().max(10),
  );

const setupRowSchema = z
  .object({
    campus_code: codeSchema,
    campus_name: safeText(160),
    campus_timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
    semester_name: safeText(160),
    semester_start_date: isoDateSchema,
    semester_end_date: isoDateSchema,
    working_saturday_rule: z.nativeEnum(WorkingSaturdayRule),
    on_track_threshold: optionalNumber(1.15),
    tight_threshold: optionalNumber(1),
    track_code: codeSchema,
    track_name: safeText(160),
    batch_code: codeSchema,
    batch_name: safeText(160),
    subject_code: codeSchema,
    subject_name: safeText(200),
    subject_description: z.string().trim().max(4_000).optional().default(''),
    target_finish_date: isoDateSchema,
  })
  .superRefine((value, context) => {
    if (value.semester_end_date < value.semester_start_date) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['semester_end_date'],
        message: 'Semester end date must be on or after its start date.',
      });
    }
    if (
      value.target_finish_date < value.semester_start_date ||
      value.target_finish_date > value.semester_end_date
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_finish_date'],
        message: 'Target finish date must be inside the semester.',
      });
    }
    if (value.on_track_threshold < value.tight_threshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['on_track_threshold'],
        message: 'On-track threshold cannot be below the tight threshold.',
      });
    }
  });

const calendarRowSchema = z.object({
  campus_code: codeSchema,
  semester_name: safeText(160),
  date: isoDateSchema,
  type: z.nativeEnum(CalendarDayType),
  title: safeText(200),
  teaching_allowed: z.preprocess((value) => {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0', ''].includes(normalized)) return false;
    return value;
  }, z.boolean()),
  notes: z.string().trim().max(4_000).optional().default(''),
});

type RawRow = { rowNumber: number; values: Record<string, string> };
type ParsedSheets = {
  setup: RawRow[];
  calendar: RawRow[];
  issues: ImportIssue[];
  totalRows: number;
};

export async function parseAndValidateSemesterImport(
  file: UploadedImportFile,
): Promise<SemesterImportPreview> {
  const fileIssue = validateFile(file);
  if (fileIssue) return emptyPreview(file.originalname, [fileIssue]);

  let parsed: ParsedSheets;
  try {
    parsed = file.originalname.toLowerCase().endsWith('.csv')
      ? parseCsvFile(file.buffer)
      : await parseExcelFile(file.buffer);
  } catch (error) {
    return emptyPreview(file.originalname, [
      issue('File', 0, null, null, errorMessage(error)),
    ]);
  }

  const issues = [...parsed.issues];
  if (parsed.totalRows > MAX_ROWS) {
    issues.push(
      issue(
        'File',
        0,
        null,
        String(parsed.totalRows),
        `A file can contain at most ${MAX_ROWS} data rows.`,
      ),
    );
  }

  const setupRows: SemesterSetupRow[] = [];
  for (const row of parsed.setup) {
    const unsafeFormula = formulaIssue('Semester Setup', row);
    if (unsafeFormula) {
      issues.push(unsafeFormula);
      continue;
    }
    const result = setupRowSchema.safeParse(row.values);
    if (!result.success) {
      issues.push(...zodIssues('Semester Setup', row, result.error));
      continue;
    }
    const value = result.data;
    setupRows.push({
      rowNumber: row.rowNumber,
      campusCode: value.campus_code,
      campusName: value.campus_name,
      campusTimezone: value.campus_timezone,
      semesterName: value.semester_name,
      semesterStartDate: value.semester_start_date,
      semesterEndDate: value.semester_end_date,
      workingSaturdayRule: value.working_saturday_rule,
      onTrackThreshold: value.on_track_threshold,
      tightThreshold: value.tight_threshold,
      trackCode: value.track_code,
      trackName: value.track_name,
      batchCode: value.batch_code,
      batchName: value.batch_name,
      subjectCode: value.subject_code,
      subjectName: value.subject_name,
      subjectDescription: value.subject_description || null,
      targetFinishDate: value.target_finish_date,
    });
  }

  const calendarRows: CalendarImportRow[] = [];
  for (const row of parsed.calendar) {
    const unsafeFormula = formulaIssue('Calendar', row);
    if (unsafeFormula) {
      issues.push(unsafeFormula);
      continue;
    }
    const result = calendarRowSchema.safeParse(row.values);
    if (!result.success) {
      issues.push(...zodIssues('Calendar', row, result.error));
      continue;
    }
    const value = result.data;
    calendarRows.push({
      rowNumber: row.rowNumber,
      campusCode: value.campus_code,
      semesterName: value.semester_name,
      date: value.date,
      type: value.type,
      title: value.title,
      teachingAllowed:
        value.type === CalendarDayType.EVENT
          ? value.teaching_allowed
          : value.type === CalendarDayType.EXTRA_WORKING_DAY,
      notes: value.notes || null,
    });
  }

  validateRelationships(setupRows, calendarRows, issues);
  const data = { setupRows, calendarRows };
  return {
    valid: issues.length === 0 && setupRows.length > 0,
    fileName: file.originalname,
    counts: { ...countImport(data), rows: parsed.totalRows },
    issues,
    data,
  };
}

export function countImport(data: SemesterImportData): ImportCounts {
  return {
    rows: data.setupRows.length + data.calendarRows.length,
    campuses: unique(data.setupRows, (row) => row.campusCode),
    semesters: unique(
      data.setupRows,
      (row) => `${row.campusCode}\u0000${row.semesterName}`,
    ),
    tracks: unique(data.setupRows, (row) => row.trackCode),
    batches: unique(
      data.setupRows,
      (row) =>
        `${row.campusCode}\u0000${row.semesterName}\u0000${row.batchCode}`,
    ),
    subjects: unique(data.setupRows, (row) => row.subjectCode),
    offerings: unique(
      data.setupRows,
      (row) =>
        `${row.campusCode}\u0000${row.semesterName}\u0000${row.batchCode}\u0000${row.subjectCode}`,
    ),
    calendarDays: data.calendarRows.length,
  };
}

function validateFile(file: UploadedImportFile): ImportIssue | null {
  const lowerName = file.originalname.toLowerCase();
  if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx')) {
    return issue(
      'File',
      0,
      null,
      file.originalname,
      'Upload a .csv or .xlsx file.',
    );
  }
  if (!file.size || !file.buffer.length) {
    return issue('File', 0, null, null, 'The uploaded file is empty.');
  }
  if (file.size > MAX_FILE_BYTES) {
    return issue(
      'File',
      0,
      null,
      String(file.size),
      'Maximum file size is 5 MB.',
    );
  }
  return null;
}

function parseCsvFile(buffer: Buffer): ParsedSheets {
  const rows = parseCsv(buffer.toString('utf8'));
  return rowsToSheet(rows, 'Semester Setup', setupColumns, true);
}

async function parseExcelFile(buffer: Buffer): Promise<ParsedSheets> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const setupSheet = workbook.getWorksheet('Semester Setup');
  if (!setupSheet) {
    throw new Error('The workbook must contain a "Semester Setup" sheet.');
  }
  const setup = rowsToSheet(
    worksheetRows(setupSheet),
    'Semester Setup',
    setupColumns,
    true,
  );
  const calendarSheet = workbook.getWorksheet('Calendar');
  const calendar = calendarSheet
    ? rowsToSheet(
        worksheetRows(calendarSheet),
        'Calendar',
        calendarColumns,
        false,
      )
    : { setup: [], calendar: [], issues: [], totalRows: 0 };
  return {
    setup: setup.setup,
    calendar: calendar.calendar,
    issues: [...setup.issues, ...calendar.issues],
    totalRows: setup.totalRows + calendar.totalRows,
  };
}

function worksheetRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      const cell = row.getCell(column);
      if (
        cell.value &&
        typeof cell.value === 'object' &&
        'formula' in cell.value
      ) {
        values.push('=FORMULA');
      } else if (cell.value instanceof Date) {
        values.push(formatDate(cell.value));
      } else {
        values.push(cell.text.trim());
      }
    }
    rows.push(values);
  });
  return rows;
}

function rowsToSheet(
  rows: string[][],
  sheet: 'Semester Setup' | 'Calendar',
  columns: readonly string[],
  required: boolean,
): ParsedSheets {
  const output: ParsedSheets = {
    setup: [],
    calendar: [],
    issues: [],
    totalRows: rows
      .slice(1)
      .filter((cells) => cells.some((value) => value.trim())).length,
  };
  if (!rows.length) {
    if (required) {
      output.issues.push(issue(sheet, 1, null, null, `${sheet} has no rows.`));
    }
    return output;
  }
  const headers = rows[0]?.map((value) => value.trim().toLowerCase()) ?? [];
  const seen = new Set<string>();
  for (const header of headers) {
    if (header && seen.has(header)) {
      output.issues.push(
        issue(sheet, 1, header, header, 'Duplicate column name.'),
      );
    }
    seen.add(header);
  }
  for (const column of columns) {
    if (!headers.includes(column)) {
      output.issues.push(
        issue(
          sheet,
          1,
          column,
          null,
          `Required column "${column}" is missing.`,
        ),
      );
    }
  }
  if (output.issues.length) return output;

  const target = sheet === 'Semester Setup' ? output.setup : output.calendar;
  rows.slice(1).forEach((cells, index) => {
    if (cells.every((value) => !value.trim())) return;
    const values: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      if (header) values[header] = cells[columnIndex]?.trim() ?? '';
    });
    target.push({ rowNumber: index + 2, values });
  });
  if (required && !target.length) {
    output.issues.push(
      issue(sheet, 2, null, null, `${sheet} has no data rows.`),
    );
  }
  return output;
}

function validateRelationships(
  setupRows: SemesterSetupRow[],
  calendarRows: CalendarImportRow[],
  issues: ImportIssue[],
) {
  validateConsistent(
    setupRows,
    (row) => row.campusCode,
    (row) => `${row.campusName}\u0000${row.campusTimezone}`,
    'campus_code',
    'Campus code is repeated with different campus details.',
    issues,
  );
  validateUniqueValue(
    setupRows,
    (row) => row.campusName,
    (row) => row.campusCode,
    'campus_name',
    'Campus name is assigned to more than one campus code.',
    issues,
  );
  validateConsistent(
    setupRows,
    (row) => `${row.campusCode}\u0000${row.semesterName}`,
    (row) =>
      `${row.semesterStartDate}\u0000${row.semesterEndDate}\u0000${row.workingSaturdayRule}\u0000${row.onTrackThreshold}\u0000${row.tightThreshold}`,
    'semester_name',
    'Semester is repeated with different dates, rules or thresholds.',
    issues,
  );
  validateUniqueValue(
    setupRows,
    (row) => row.trackName,
    (row) => row.trackCode,
    'track_name',
    'Track name is assigned to more than one track code.',
    issues,
  );
  validateConsistent(
    setupRows,
    (row) => row.trackCode,
    (row) => row.trackName,
    'track_code',
    'Track code is repeated with a different name.',
    issues,
  );
  validateConsistent(
    setupRows,
    (row) => `${row.campusCode}\u0000${row.semesterName}\u0000${row.batchCode}`,
    (row) => `${row.batchName}\u0000${row.trackCode}`,
    'batch_code',
    'Batch code is repeated with a different name or track.',
    issues,
  );
  validateConsistent(
    setupRows,
    (row) => row.subjectCode,
    (row) => `${row.subjectName}\u0000${row.subjectDescription ?? ''}`,
    'subject_code',
    'Subject code is repeated with different subject details.',
    issues,
  );

  const offerings = new Map<string, SemesterSetupRow>();
  for (const row of setupRows) {
    const key = `${row.campusCode}\u0000${row.semesterName}\u0000${row.batchCode}\u0000${row.subjectCode}`;
    if (offerings.has(key)) {
      issues.push(
        issue(
          'Semester Setup',
          row.rowNumber,
          'subject_code',
          row.subjectCode,
          'This batch and subject offering appears more than once.',
        ),
      );
    } else {
      offerings.set(key, row);
    }
  }

  const semesters = new Map(
    setupRows.map((row) => [`${row.campusCode}\u0000${row.semesterName}`, row]),
  );
  const calendarKeys = new Set<string>();
  for (const row of calendarRows) {
    const semester = semesters.get(
      `${row.campusCode}\u0000${row.semesterName}`,
    );
    if (!semester) {
      issues.push(
        issue(
          'Calendar',
          row.rowNumber,
          'semester_name',
          row.semesterName,
          'Calendar row references a semester missing from Semester Setup.',
        ),
      );
      continue;
    }
    if (
      row.date < semester.semesterStartDate ||
      row.date > semester.semesterEndDate
    ) {
      issues.push(
        issue(
          'Calendar',
          row.rowNumber,
          'date',
          row.date,
          'Calendar date must be inside the semester.',
        ),
      );
    }
    const key = `${row.campusCode}\u0000${row.semesterName}\u0000${row.date}`;
    if (calendarKeys.has(key)) {
      issues.push(
        issue(
          'Calendar',
          row.rowNumber,
          'date',
          row.date,
          'Only one calendar override is allowed for a semester date.',
        ),
      );
    }
    calendarKeys.add(key);
  }
}

function validateConsistent(
  rows: SemesterSetupRow[],
  keyOf: (row: SemesterSetupRow) => string,
  valueOf: (row: SemesterSetupRow) => string,
  columnName: string,
  message: string,
  issues: ImportIssue[],
) {
  const values = new Map<string, string>();
  for (const row of rows) {
    const key = keyOf(row);
    const previous = values.get(key);
    const value = valueOf(row);
    if (previous !== undefined && previous !== value) {
      issues.push(
        issue(
          'Semester Setup',
          row.rowNumber,
          columnName,
          key.split('\u0000').at(-1) ?? key,
          message,
        ),
      );
    } else {
      values.set(key, value);
    }
  }
}

function validateUniqueValue(
  rows: SemesterSetupRow[],
  valueOf: (row: SemesterSetupRow) => string,
  keyOf: (row: SemesterSetupRow) => string,
  columnName: string,
  message: string,
  issues: ImportIssue[],
) {
  const keys = new Map<string, string>();
  for (const row of rows) {
    const value = valueOf(row).toLocaleLowerCase('en-US');
    const key = keyOf(row);
    const previous = keys.get(value);
    if (previous !== undefined && previous !== key) {
      issues.push(
        issue(
          'Semester Setup',
          row.rowNumber,
          columnName,
          valueOf(row),
          message,
        ),
      );
    } else {
      keys.set(value, key);
    }
  }
}

function formulaIssue(sheet: string, row: RawRow) {
  const entry = Object.entries(row.values).find(([, value]) =>
    /^[=+@]/.test(value),
  );
  return entry
    ? issue(
        sheet,
        row.rowNumber,
        entry[0],
        entry[1],
        'Spreadsheet formulas are not allowed.',
      )
    : null;
}

function zodIssues(
  sheet: string,
  row: RawRow,
  error: z.ZodError,
): ImportIssue[] {
  return error.issues.map((entry) => {
    const columnName = String(entry.path[0] ?? 'row');
    return issue(
      sheet,
      row.rowNumber,
      columnName,
      row.values[columnName] ?? null,
      entry.message,
    );
  });
}

function emptyPreview(
  fileName: string,
  issues: ImportIssue[],
): SemesterImportPreview {
  return {
    valid: false,
    fileName,
    counts: countImport({ setupRows: [], calendarRows: [] }),
    issues,
    data: { setupRows: [], calendarRows: [] },
  };
}

function unique<T>(rows: T[], keyOf: (row: T) => string) {
  return new Set(rows.map(keyOf)).size;
}

function issue(
  sheet: string,
  rowNumber: number,
  columnName: string | null,
  submittedValue: string | null,
  errorMessage: string,
): ImportIssue {
  return { sheet, rowNumber, columnName, submittedValue, errorMessage };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The file could not be read.';
}

function formatDate(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field) throw new Error('Malformed CSV quoting.');
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}
