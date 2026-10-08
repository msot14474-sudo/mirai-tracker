import ExcelJS from 'exceljs';
import { z } from 'zod';
import { parseCsv } from '../semester-import/semester-import.parser';
import {
  ImportIssue,
  LessonPlanPreview,
  LessonPlanRow,
  UploadedImportFile,
  lessonPlanColumns,
} from './lesson-plan.types';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1_000;
const rowSchema = z.object({
  unit_sequence: z.coerce.number().int().positive().max(200),
  unit_title: safeText(200),
  unit_description: z.string().trim().max(4_000).optional().default(''),
  topic_sequence: z.coerce.number().int().positive().max(1_000),
  topic_title: safeText(240),
  topic_description: z.string().trim().max(4_000).optional().default(''),
  planned_minutes: z.coerce.number().int().positive().max(10_080),
  exam_names: z.string().trim().max(2_000).optional().default(''),
});

type RawRow = { rowNumber: number; values: Record<string, string> };

export async function parseLessonPlanFile(
  file: UploadedImportFile,
): Promise<LessonPlanPreview> {
  const fileIssue = validateFile(file);
  if (fileIssue) return emptyPreview(file.originalname, [fileIssue]);

  let sourceRows: string[][];
  try {
    sourceRows = file.originalname.toLowerCase().endsWith('.csv')
      ? parseCsv(file.buffer.toString('utf8'))
      : await excelRows(file.buffer);
  } catch (error) {
    return emptyPreview(file.originalname, [
      issue(0, null, null, message(error)),
    ]);
  }

  const { rows: rawRows, issues } = mapRows(sourceRows);
  if (rawRows.length > MAX_ROWS) {
    issues.push(
      issue(
        0,
        null,
        String(rawRows.length),
        `A lesson plan can contain at most ${MAX_ROWS} topics.`,
      ),
    );
  }

  const rows: LessonPlanRow[] = [];
  for (const row of rawRows.slice(0, MAX_ROWS)) {
    const formula = Object.entries(row.values).find(([, value]) =>
      /^[=+@]/.test(value),
    );
    if (formula) {
      issues.push(
        issue(
          row.rowNumber,
          formula[0],
          formula[1],
          'Spreadsheet formulas are not allowed.',
        ),
      );
      continue;
    }
    const result = rowSchema.safeParse(row.values);
    if (!result.success) {
      for (const problem of result.error.issues) {
        const column = String(problem.path[0] ?? 'row');
        issues.push(
          issue(
            row.rowNumber,
            column,
            row.values[column] ?? null,
            problem.message,
          ),
        );
      }
      continue;
    }
    rows.push({
      rowNumber: row.rowNumber,
      unitSequence: result.data.unit_sequence,
      unitTitle: result.data.unit_title,
      unitDescription: result.data.unit_description || null,
      topicSequence: result.data.topic_sequence,
      topicTitle: result.data.topic_title,
      topicDescription: result.data.topic_description || null,
      plannedMinutes: result.data.planned_minutes,
      examNames: [
        ...new Set(
          result.data.exam_names
            .split('|')
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ],
    });
  }

  validateStructure(rows, issues);
  return {
    valid: rows.length > 0 && issues.length === 0,
    fileName: file.originalname,
    counts: counts(rows),
    issues,
    rows,
  };
}

function validateFile(file: UploadedImportFile) {
  const name = file.originalname.toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
    return issue(0, null, file.originalname, 'Upload a .csv or .xlsx file.');
  }
  if (!file.size || !file.buffer.length) {
    return issue(0, null, null, 'The uploaded file is empty.');
  }
  if (file.size > MAX_FILE_BYTES) {
    return issue(0, null, String(file.size), 'Maximum file size is 2 MB.');
  }
  return null;
}

async function excelRows(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Lesson Plan');
  if (!sheet)
    throw new Error('The workbook must contain a "Lesson Plan" sheet.');
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let index = 1; index <= row.cellCount; index += 1) {
      const cell = row.getCell(index);
      if (
        cell.value &&
        typeof cell.value === 'object' &&
        'formula' in cell.value
      ) {
        cells.push('=FORMULA');
      } else {
        cells.push(cell.text.trim());
      }
    }
    rows.push(cells);
  });
  return rows;
}

function mapRows(sourceRows: string[][]) {
  const issues: ImportIssue[] = [];
  if (!sourceRows.length) {
    return {
      rows: [],
      issues: [issue(1, null, null, 'Lesson Plan has no rows.')],
    };
  }
  const headers =
    sourceRows[0]?.map((value) => value.trim().toLowerCase()) ?? [];
  const seen = new Set<string>();
  for (const header of headers) {
    if (header && seen.has(header)) {
      issues.push(issue(1, header, header, 'Duplicate column name.'));
    }
    seen.add(header);
  }
  for (const column of lessonPlanColumns) {
    if (!headers.includes(column)) {
      issues.push(
        issue(1, column, null, `Required column "${column}" is missing.`),
      );
    }
  }
  if (issues.length) return { rows: [], issues };
  const rows: RawRow[] = [];
  sourceRows.slice(1).forEach((cells, index) => {
    if (cells.every((value) => !value.trim())) return;
    const values: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header) values[header] = cells[column]?.trim() ?? '';
    });
    rows.push({ rowNumber: index + 2, values });
  });
  if (!rows.length)
    issues.push(issue(2, null, null, 'Lesson Plan has no data rows.'));
  return { rows, issues };
}

function validateStructure(rows: LessonPlanRow[], issues: ImportIssue[]) {
  const units = new Map<number, { signature: string; rowNumber: number }>();
  const topics = new Set<string>();
  for (const row of rows) {
    const signature = `${row.unitTitle}\u0000${row.unitDescription ?? ''}`;
    const unit = units.get(row.unitSequence);
    if (unit && unit.signature !== signature) {
      issues.push(
        issue(
          row.rowNumber,
          'unit_sequence',
          String(row.unitSequence),
          'A unit sequence is repeated with different unit details.',
        ),
      );
    } else if (!unit) {
      units.set(row.unitSequence, { signature, rowNumber: row.rowNumber });
    }
    const topicKey = `${row.unitSequence}:${row.topicSequence}`;
    if (topics.has(topicKey)) {
      issues.push(
        issue(
          row.rowNumber,
          'topic_sequence',
          String(row.topicSequence),
          'Topic sequence must be unique inside its unit.',
        ),
      );
    }
    topics.add(topicKey);
  }
  validateSequence(
    [...units.keys()],
    'unit_sequence',
    rows[0]?.rowNumber ?? 2,
    issues,
  );
  for (const unitSequence of units.keys()) {
    const unitRows = rows.filter((row) => row.unitSequence === unitSequence);
    validateSequence(
      unitRows.map((row) => row.topicSequence),
      'topic_sequence',
      unitRows[0]?.rowNumber ?? 2,
      issues,
    );
  }
}

function validateSequence(
  values: number[],
  column: string,
  rowNumber: number,
  issues: ImportIssue[],
) {
  const actual = [...new Set(values)].sort((a, b) => a - b);
  const expected = actual.map((_, index) => index + 1);
  if (actual.some((value, index) => value !== expected[index])) {
    issues.push(
      issue(
        rowNumber,
        column,
        actual.join(', '),
        'Sequences must start at 1 and contain no gaps.',
      ),
    );
  }
}

function counts(rows: LessonPlanRow[]) {
  return {
    rows: rows.length,
    units: new Set(rows.map((row) => row.unitSequence)).size,
    topics: rows.length,
    totalPlannedMinutes: rows.reduce(
      (total, row) => total + row.plannedMinutes,
      0,
    ),
  };
}

function emptyPreview(
  fileName: string,
  issues: ImportIssue[],
): LessonPlanPreview {
  return {
    valid: false,
    fileName,
    counts: counts([]),
    issues,
    rows: [],
  };
}

function issue(
  rowNumber: number,
  columnName: string | null,
  submittedValue: string | null,
  errorMessage: string,
): ImportIssue {
  return {
    sheet: 'Lesson Plan',
    rowNumber,
    columnName,
    submittedValue,
    errorMessage,
  };
}

function safeText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/^[=+@]/.test(value), {
      message: 'Spreadsheet formulas are not allowed.',
    });
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The file could not be read.';
}
