import ExcelJS from 'exceljs';
import { z } from 'zod';
import { parseCsv } from '../semester-import/semester-import.parser';
import { UploadedImportFile } from '../semester-import/semester-import.types';
import { readCalendarDate } from '../semester-import/calendar-reader';
import { durationMinutes } from '../timetable/timetable-engine';

export const bundleColumns = {
  Subjects: [
    'batch_code',
    'batch_name',
    'track_code',
    'track_name',
    'subject_code',
    'subject_name',
    'description',
    'target_finish_date',
  ],
  Faculty: [
    'batch_code',
    'subject_code',
    'faculty_email',
    'assignment_type',
    'start_date',
    'end_date',
  ],
  Calendar: ['date', 'end_date', 'title', 'type', 'teaching_allowed', 'notes'],
  Exams: ['exam_name', 'type', 'start_date', 'end_date', 'syllabus_deadline'],
  Timetable: [
    'batch_code',
    'subject_code',
    'faculty_email',
    'weekday',
    'start_time',
    'end_time',
    'effective_from',
    'effective_to',
  ],
  Lessons: [
    'batch_code',
    'subject_code',
    'unit_sequence',
    'unit_title',
    'topic_sequence',
    'topic_title',
    'planned_hours',
    'completion_percentage',
    'exam_names',
    'notes',
  ],
  Sessions: [
    'batch_code',
    'subject_code',
    'faculty_email',
    'date',
    'start_time',
    'end_time',
    'status',
    'completion_percentage',
    'covered',
    'left_over',
    'classwork_status',
    'homework_status',
    'notes',
    'unit_sequence',
    'topic_sequence',
    'topic_completion_percentage',
    'merged_to_date',
    'merged_to_start_time',
  ],
  Rates: ['faculty_email', 'effective_from', 'rate_per_class'],
  Expenses: [
    'reference',
    'faculty_email',
    'date',
    'category',
    'amount',
    'notes',
  ],
  Payments: ['reference', 'faculty_email', 'date', 'amount', 'notes'],
} as const;
export type Dataset = keyof typeof bundleColumns;
export type BundleRow = {
  dataset: Dataset;
  file: string;
  sheet: string;
  row: number;
  values: Record<string, string>;
  original: Record<string, string>;
};
export type BundleIssue = { location: string; message: string };
export const normalize = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9]/g, '');
const datasetAliases: Record<string, Dataset> = {
  subjects: 'Subjects',
  courses: 'Subjects',
  offerings: 'Subjects',
  faculty: 'Faculty',
  teachers: 'Faculty',
  assignments: 'Faculty',
  calendar: 'Calendar',
  calendarupdates: 'Calendar',
  holidays: 'Calendar',
  exams: 'Exams',
  examwindows: 'Exams',
  timetable: 'Timetable',
  weeklytimetable: 'Timetable',
  lessons: 'Lessons',
  lessonplan: 'Lessons',
  lessonplans: 'Lessons',
  topics: 'Lessons',
  sessions: 'Sessions',
  sessionlogs: 'Sessions',
  classlogs: 'Sessions',
  rates: 'Rates',
  honorariumrates: 'Rates',
  expenses: 'Expenses',
  payments: 'Payments',
};
const allFields = new Set<string>(Object.values(bundleColumns).flat());
const fieldAliases: Record<string, string> = Object.fromEntries(
  [...allFields, 'dataset', 'campus_code', 'semester_name', 'date_format'].map(
    (k) => [normalize(k), k],
  ),
);
Object.assign(fieldAliases, {
  teacheremail: 'faculty_email',
  email: 'faculty_email',
  day: 'weekday',
  dayoftheweek: 'weekday',
  teacher: 'faculty_email',
  plannedhr: 'planned_hours',
  plannedhours: 'planned_hours',
  percentcomplete: 'completion_percentage',
  complete: 'completion_percentage',
  topic: 'topic_title',
  unit: 'unit_title',
  datetaught: 'date',
});
export function location(r: Pick<BundleRow, 'file' | 'sheet' | 'row'>) {
  return `${r.file} · ${r.sheet} · row ${r.row}`;
}
const required: Record<Dataset, string[]> = {
  Subjects: [
    'batch_code',
    'batch_name',
    'track_code',
    'track_name',
    'subject_code',
    'subject_name',
  ],
  Faculty: ['batch_code', 'subject_code', 'faculty_email'],
  Calendar: ['date', 'title', 'type'],
  Exams: ['exam_name', 'type', 'start_date', 'end_date'],
  Timetable: [
    'batch_code',
    'subject_code',
    'weekday',
    'start_time',
    'end_time',
  ],
  Lessons: [
    'batch_code',
    'subject_code',
    'unit_sequence',
    'unit_title',
    'topic_sequence',
    'topic_title',
    'planned_hours',
  ],
  Sessions: [
    'batch_code',
    'subject_code',
    'faculty_email',
    'date',
    'start_time',
    'end_time',
    'status',
    'completion_percentage',
    'covered',
  ],
  Rates: ['faculty_email', 'effective_from', 'rate_per_class'],
  Expenses: ['reference', 'faculty_email', 'date', 'category', 'amount'],
  Payments: ['reference', 'faculty_email', 'date', 'amount'],
};
const enumFields: Record<string, string[]> = {
  'Faculty.assignment_type': ['PRIMARY', 'CO_FACULTY', 'VISITING'],
  'Calendar.type': ['HOLIDAY', 'EVENT', 'EXTRA_WORKING_DAY', 'CAMPUS_CLOSED'],
  'Exams.type': ['SESSIONAL', 'MID_TERM', 'PUT', 'END_TERM', 'OTHER'],
  'Sessions.status': [
    'COMPLETED',
    'IN_PROGRESS',
    'SKIPPED',
    'MERGED',
    'CANCELLED',
  ],
  'Sessions.classwork_status': [
    'NOT_APPLICABLE',
    'NOT_ASSIGNED',
    'ASSIGNED',
    'PARTIAL',
    'COMPLETED',
  ],
  'Sessions.homework_status': [
    'NOT_APPLICABLE',
    'NOT_ASSIGNED',
    'ASSIGNED',
    'PARTIAL',
    'COMPLETED',
  ],
};
const dates = [
  'date',
  'start_date',
  'end_date',
  'effective_from',
  'effective_to',
  'syllabus_deadline',
  'target_finish_date',
  'merged_to_date',
];

export async function readBundle(
  files: UploadedImportFile[],
  context: {
    start: string;
    end: string;
    campusCode: string;
    semesterName: string;
  },
) {
  const rows: BundleRow[] = [],
    issues: BundleIssue[] = [],
    warnings: BundleIssue[] = [];
  const skippedSheets: string[] = [];
  const years = [
    ...new Set([+context.start.slice(0, 4), +context.end.slice(0, 4)]),
  ];
  for (const file of files) {
    let sheets: { name: string; rows: string[][] }[];
    try {
      if (/\.csv$/i.test(file.originalname)) {
        sheets = [
          {
            name: file.originalname.replace(/\.csv$/i, ''),
            rows: parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, '')),
          },
        ];
      } else if (/\.xlsx$/i.test(file.originalname)) {
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
        sheets = book.worksheets.map((s) => ({
          name: s.name,
          rows: Array.from({ length: s.rowCount }, (_, i) =>
            Array.from({ length: s.columnCount }, (_, j) =>
              cellValue(s.getCell(i + 1, j + 1)),
            ),
          ),
        }));
      } else
        throw new Error(
          'Use an .xlsx workbook or .csv file. Save legacy .xls workbooks as .xlsx first.',
        );
    } catch (e) {
      issues.push({
        location: file.originalname,
        message: e instanceof Error ? e.message : 'File could not be read.',
      });
      continue;
    }
    for (const sheet of sheets) {
      if (
        /^(readme|instructions?|guide|legend|help)/.test(normalize(sheet.name))
      ) {
        skippedSheets.push(`${file.originalname} · ${sheet.name}`);
        continue;
      }
      const first = sheet.rows.findIndex((r) => r.some((v) => v.trim()));
      if (first < 0) continue;
      const width = sheet.rows.reduce((max, r) => Math.max(max, r.length), 0);
      const headings = Array.from({ length: width }, (_, i) =>
        (sheet.rows[first]![i] ?? '').trim(),
      );
      const headerFields = headings.map((h) => fieldAliases[normalize(h)] ?? h);
      if (
        new Set(headerFields.filter(Boolean)).size !==
        headerFields.filter(Boolean).length
      ) {
        issues.push({
          location: `${file.originalname} · ${sheet.name}`,
          message:
            'Duplicate column headings. Give each column a distinct name.',
        });
        continue;
      }
      const guessed = datasetAliases[normalize(sheet.name).replace(/^\d+/, '')];
      for (let i = first + 1; i < sheet.rows.length; i++) {
        const cells = sheet.rows[i]!;
        if (!cells.some((v) => v.trim())) continue;
        const original = Object.fromEntries(
          headings.map((h, j) => [h || `Column ${j + 1}`, cells[j] ?? '']),
        );
        const values = Object.fromEntries(
          headerFields.map((h, j) => [
            h || `column_${j + 1}`,
            String(cells[j] ?? '').trim(),
          ]),
        );
        const dataset =
          datasetAliases[normalize(values.dataset ?? '')] ?? guessed;
        const loc = { file: file.originalname, sheet: sheet.name, row: i + 1 };
        if (!dataset) {
          issues.push({
            location: location(loc),
            message:
              'Choose a template sheet name or add a dataset column (Subjects, Faculty, Calendar, Exams, Timetable, Lessons, Sessions, Rates, Expenses or Payments).',
          });
          continue;
        }
        const row: BundleRow = { ...loc, dataset, values, original };
        const fail = (message: string) =>
          issues.push({ location: location(row), message });
        if (
          values.campus_code &&
          values.campus_code.toUpperCase() !== context.campusCode.toUpperCase()
        )
          fail('This row belongs to another campus.');
        if (
          values.semester_name &&
          values.semester_name !== context.semesterName
        )
          fail('This row belongs to another semester.');
        for (const field of required[dataset])
          if (!values[field]) fail(`Missing ${field.replaceAll('_', ' ')}.`);
        for (const [key, value] of Object.entries(values)) {
          if (value === '[Formula without saved result]')
            fail(`${key}: save calculated values in Excel before importing.`);
          if (
            value &&
            ![
              ...bundleColumns[dataset],
              'dataset',
              'campus_code',
              'semester_name',
              'date_format',
            ].includes(key as never)
          ) {
            warnings.push({
              location: location(row),
              message: `${key} is retained in the source archive; it does not change an app field.`,
            });
          }
          const limit: Record<string, number> = {
            track_code: 32,
            batch_name: 160,
            track_name: 160,
            subject_name: 200,
            title: 200,
            exam_name: 160,
            unit_title: 200,
            topic_title: 240,
            faculty_email: 320,
            category: 80,
            reference: 190,
          };
          const max =
            limit[key] ??
            (['Expenses', 'Payments'].includes(dataset) && key === 'notes'
              ? 2000
              : undefined);
          if (max && value.length > max)
            fail(`${key}: use at most ${max} characters.`);
        }
        for (const key of ['batch_code', 'subject_code', 'track_code'])
          if (values[key]) {
            values[key] = values[key]!.toUpperCase();
            if (!/^[A-Z0-9._/-]{1,64}$/.test(values[key]!))
              fail(`${key}: use a valid code up to 64 characters.`);
          }
        if (values.faculty_email) {
          values.faculty_email = values.faculty_email.toLowerCase();
          if (!z.string().email().safeParse(values.faculty_email).success)
            fail('Enter a valid faculty email.');
        }
        for (const key of dates)
          if (values[key]) {
            const order = values.date_format?.toUpperCase();
            const date = readCalendarDate(
              values[key]!,
              years,
              order === 'DMY' || order === 'MDY' ? order : undefined,
            );
            if (!date)
              fail(
                `${key}: ambiguous or invalid date. Use YYYY-MM-DD, or specify date_format as DMY or MDY.`,
              );
            else {
              values[key] = date;
              if (
                !['Rates', 'Expenses', 'Payments'].includes(dataset) &&
                (date < context.start || date > context.end)
              )
                fail(
                  `${key} is outside the selected semester (${context.start} to ${context.end}).`,
                );
            }
          }
        for (const [key, allowed] of Object.entries(enumFields)) {
          const [group, field] = key.split('.');
          if (group === dataset && values[field!]) {
            values[field!] = values[field!]!.toUpperCase().replace(
              /[\s-]+/g,
              '_',
            );
            if (!allowed.includes(values[field!]!))
              fail(`${field}: use ${allowed.join(', ')}.`);
          }
        }
        if (
          values.teaching_allowed &&
          !/^(true|false|yes|no|1|0)$/i.test(values.teaching_allowed)
        )
          fail('teaching_allowed must be true or false.');
        if (dataset === 'Timetable') {
          const n = [
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
          ].findIndex((d) =>
            d.startsWith((values.weekday ?? '').toLowerCase()),
          );
          if (n >= 0 && values.weekday) values.weekday = String(n + 1);
          if (!/^[1-7]$/.test(values.weekday ?? ''))
            fail('Choose a weekday from Monday to Sunday, or 1 to 7.');
        }
        if (['Timetable', 'Sessions'].includes(dataset)) {
          for (const key of ['start_time', 'end_time', 'merged_to_start_time'])
            if (values[key]) values[key] = readTime(values[key]!);
          try {
            durationMinutes(values.start_time ?? '', values.end_time ?? '');
          } catch (e) {
            fail((e as Error).message);
          }
        }
        for (const key of [
          'rate_per_class',
          'amount',
          'planned_hours',
          'completion_percentage',
          'topic_completion_percentage',
          'unit_sequence',
          'topic_sequence',
        ])
          if (values[key]) {
            const number = Number(values[key]);
            if (!Number.isFinite(number) || number < 0)
              fail(`${key} must be a nonnegative number.`);
            else if (key.endsWith('percentage') && number > 100)
              fail(`${key} cannot exceed 100.`);
            else if (
              key.endsWith('sequence') &&
              (!Number.isInteger(number) || number < 1)
            )
              fail(`${key} must be a positive whole number.`);
            else if (
              key === 'planned_hours' &&
              (number <= 0 || !Number.isInteger(number * 60) || number > 1000)
            )
              fail(
                'planned_hours must represent a positive whole number of minutes, up to 1,000 hours.',
              );
            else if (
              ['rate_per_class', 'amount'].includes(key) &&
              (number > 1_000_000 ||
                Math.abs(number * 100 - Math.round(number * 100)) > 0.00001 ||
                (key === 'amount' && number === 0))
            )
              fail(
                `${key}: enter a valid amount with at most two decimals, up to 1,000,000.`,
              );
          }
        if (dataset === 'Subjects') values.target_finish_date ||= context.end;
        if (dataset === 'Faculty') {
          values.assignment_type ||= 'PRIMARY';
          values.start_date ||= context.start;
          values.end_date ||= context.end;
        }
        if (dataset === 'Timetable') {
          values.effective_from ||= context.start;
          values.effective_to ||= context.end;
        }
        if (dataset === 'Exams')
          values.syllabus_deadline ||= values.start_date!;
        if (dataset === 'Lessons') values.completion_percentage ||= '0';
        for (const [a, b] of [
          ['start_date', 'end_date'],
          ['effective_from', 'effective_to'],
          ['date', 'end_date'],
        ])
          if (values[a!] && values[b!] && values[a!]! > values[b!]!)
            fail(`${b} must not be before ${a}.`);
        if (
          dataset === 'Exams' &&
          values.syllabus_deadline! > values.start_date!
        )
          fail('Syllabus deadline must not be later than the exam start.');
        if (
          dataset === 'Sessions' &&
          values.status === 'MERGED' &&
          (!values.merged_to_date || !values.merged_to_start_time)
        )
          fail(
            'Merged sessions require merged_to_date and merged_to_start_time.',
          );
        if (
          dataset === 'Calendar' &&
          ['HOLIDAY', 'CAMPUS_CLOSED'].includes(values.type ?? '') &&
          /^(true|yes|1)$/i.test(values.teaching_allowed ?? '')
        )
          fail(
            'Holidays and campus closures cannot allow teaching. Use EVENT or EXTRA_WORKING_DAY.',
          );
        rows.push(row);
      }
    }
  }
  if (!rows.length && !issues.length)
    issues.push({
      location: 'Files',
      message: 'No data rows found. Add records below the template headings.',
    });
  return {
    rows,
    issues,
    warnings,
    skippedSheets,
    counts: Object.fromEntries(
      Object.keys(bundleColumns).map((k) => [
        k,
        rows.filter((r) => r.dataset === k).length,
      ]),
    ),
  };
}

function readTime(text: string) {
  const match = /^(\d{1,2}):(\d{2})(?::00)?\s*(AM|PM)?$/i.exec(text);
  if (!match) return text;
  let hour = +match[1]!;
  if (match[3]) {
    if (hour < 1 || hour > 12) return text;
    hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  }
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
function cellValue(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date)
    return value.getUTCFullYear() < 1910
      ? value.toISOString().slice(11, 16)
      : value.toISOString().slice(0, 10);
  if (
    typeof value === 'number' &&
    /[hH]/.test(cell.numFmt) &&
    value >= 0 &&
    value < 1
  ) {
    const minutes = Math.round(value * 1440);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value)
      return value.result == null
        ? '[Formula without saved result]'
        : value.result instanceof Date
          ? value.result.toISOString().slice(0, 10)
          : String(value.result);
    if ('richText' in value) return value.richText.map((x) => x.text).join('');
    if ('text' in value) return value.text;
    return cell.text;
  }
  return String(value);
}

export async function bundleTemplate(format: 'xlsx' | 'csv') {
  if (format === 'csv') {
    const columns = [
      'dataset',
      ...new Set(Object.values(bundleColumns).flat()),
    ];
    return Buffer.from(columns.join(',') + '\r\n', 'utf8');
  }
  const book = new ExcelJS.Workbook();
  const readme = book.addWorksheet('Read Me');
  readme.addRows([
    ['Full semester data import'],
    ['Choose the existing campus semester in Mirai Tracker before uploading.'],
    [
      'Fill only the sheets you need. Empty sheets and this Read Me sheet are skipped.',
    ],
    [
      'Use YYYY-MM-DD for dates and HH:mm for times. Faculty emails must already have campus faculty access.',
    ],
    [
      'Subjects links each subject to a batch and track. Faculty links existing teachers to those subjects.',
    ],
    [
      'Lessons appends new topics and preserves existing progress. exam_names is separated by |.',
    ],
    [
      'Sessions are actual dated class records; percentages and covered summaries are required. No future logs.',
    ],
    [
      'Visiting rates and expenses use INR. Give Expenses and Payments unique reference values for duplicate protection.',
    ],
    [
      'Calendar contains explicit date updates only. Unlisted dates and the semester Saturday rule are preserved.',
    ],
    [
      'For multiple CSV files use the sheet name as the file name, or include a dataset column.',
    ],
    [
      'Extra columns are retained in the source archive and reported in the preview. Analytics are recalculated from imported records.',
    ],
  ]);
  readme.getColumn(1).width = 120;
  for (const [name, headers] of Object.entries(bundleColumns)) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF214DA5' },
    };
    sheet.columns.forEach((c) => {
      c.width = 25;
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
