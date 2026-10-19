import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { UploadedImportFile } from '../semester-import/semester-import.types';

export type TimetableImportRow = {
  source: string;
  subject: string;
  teacher: string;
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
};
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string[]> = {
  subject: ['subject', 'subjectcode', 'subjectname', 'course', 'coursecode'],
  teacher: ['teacher', 'faculty', 'teacheremail', 'facultyemail', 'instructor'],
  weekday: ['day', 'weekday', 'dayoftheweek'],
  startTime: ['start', 'starttime', 'starts', 'fromtime'],
  endTime: ['end', 'endtime', 'ends', 'totime'],
  effectiveFrom: ['effectivefrom', 'repeatfrom', 'startdate'],
  effectiveTo: ['effectiveto', 'repeatuntil', 'enddate'],
};
export const timetableCsvTemplate =
  'Subject,Teacher,Day,Start time,End time,Effective from,Effective to\r\n';

export function importTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 1440);
    if (minutes >= 1440) throw new Error('Time must be before midnight.');
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{1,2})(?::(\d{2})(?::00)?)?\s*(am|pm)?$/i);
  if (!match || (!match[2] && !match[3]))
    throw new Error('Use HH:mm or a time such as 9:00 AM.');
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (match[3]) {
    if (hour < 1 || hour > 12) throw new Error('Invalid 12-hour time.');
    hour = (hour % 12) + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  }
  if (hour > 23 || minute > 59) throw new Error('Invalid time.');
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function date(value: unknown, fallback: string) {
  if (value === '' || value == null) return fallback;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const result = match
    ? `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
    : s;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    throw new Error('Use YYYY-MM-DD or DD/MM/YYYY dates.');
  return result;
}
function value(cell: ExcelJS.Cell): unknown {
  const raw = cell.value;
  if (
    raw &&
    typeof raw === 'object' &&
    ('formula' in raw || 'sharedFormula' in raw)
  ) {
    if (raw.result === undefined)
      throw new Error(
        'Save calculated formula results in Excel before uploading.',
      );
    return raw.result;
  }
  return raw instanceof Date || typeof raw === 'number'
    ? raw
    : cell.text.trim();
}
export async function parseBatchTimetable(
  file: UploadedImportFile,
  from: string,
  to: string,
) {
  const workbook = new ExcelJS.Workbook();
  try {
    if (file.originalname.toLowerCase().endsWith('.xlsx'))
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    else if (file.originalname.toLowerCase().endsWith('.csv'))
      await workbook.csv.read(Readable.from([file.buffer]), {
        map: (v: string) => v,
      });
    else throw new Error('format');
  } catch {
    throw new BadRequestException(
      'Upload a readable Excel (.xlsx) or CSV timetable.',
    );
  }
  const rows: TimetableImportRow[] = [];
  const errors: { source: string; message: string }[] = [];
  for (const sheet of workbook.worksheets) {
    if (!sheet.actualRowCount) continue;
    let header = 0;
    let columns: Record<string, number> = {};
    for (let n = 1; n <= Math.min(sheet.rowCount, 30); n++) {
      const found: Record<string, number> = {};
      sheet.getRow(n).eachCell((cell, c) => {
        const key = Object.keys(aliases).find((k) =>
          aliases[k]!.includes(normalize(cell.text)),
        );
        if (key) found[key] = c;
      });
      if (
        ['subject', 'weekday', 'startTime', 'endTime'].every((k) => found[k])
      ) {
        header = n;
        columns = found;
        break;
      }
    }
    if (!header) {
      errors.push({
        source: sheet.name,
        message:
          'Add columns for Subject, Day, Start time and End time. Use the CSV template for a row-by-row timetable.',
      });
      continue;
    }
    for (let n = header + 1; n <= sheet.rowCount; n++) {
      if (!sheet.getRow(n).hasValues) continue;
      const source = `${sheet.name} · row ${n}`;
      try {
        const get = (key: string) =>
          columns[key] ? value(sheet.getRow(n).getCell(columns[key]!)) : '';
        const subject = String(get('subject')).trim();
        if (!subject) throw new Error('Subject is required.');
        const day = String(get('weekday')).trim().toLowerCase();
        const weekday = /^[1-7]$/.test(day)
          ? Number(day)
          : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(
              day.slice(0, 3),
            ) + 1;
        if (!weekday) throw new Error('Use a weekday name, such as Monday.');
        const startTime = importTime(get('startTime'));
        const endTime = importTime(get('endTime'));
        if (endTime <= startTime)
          throw new Error('End time must be after start time on the same day.');
        const effectiveFrom = date(get('effectiveFrom'), from),
          effectiveTo = date(get('effectiveTo'), to);
        if (
          effectiveFrom < from ||
          effectiveTo > to ||
          effectiveFrom > effectiveTo
        )
          throw new Error(
            'Repeat dates must be ordered and within the selected semester.',
          );
        rows.push({
          source,
          subject,
          teacher: String(get('teacher')).trim(),
          weekday,
          startTime,
          endTime,
          effectiveFrom,
          effectiveTo,
        });
      } catch (e) {
        errors.push({ source, message: (e as Error).message });
      }
    }
  }
  if (!rows.length && !errors.length)
    errors.push({
      source: 'File',
      message: 'No weekly classes found in this file.',
    });
  return { rows, errors };
}
