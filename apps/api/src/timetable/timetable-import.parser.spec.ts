import ExcelJS from 'exceljs';
import { importTime, parseBatchTimetable } from './timetable-import.parser';
const csv = (text: string) =>
  ({ originalname: 'weekly.csv', buffer: Buffer.from(text) }) as never;
const parse = (text: string) =>
  parseBatchTimetable(csv(text), '2026-08-08', '2026-12-08');
it('reads all subjects, AM/PM times and optional repeat dates', async () => {
  const result = await parse(
    'Subject,Teacher,Day,Start time,End time,Effective from,Effective to\nDSA,asha@example.edu,Monday,9:00 AM,10:30 AM,,\nWEB,raj@example.edu,Thu,14:00,15:00,01/09/2026,30/11/2026',
  );
  expect(result.errors).toEqual([]);
  expect(result.rows).toHaveLength(2);
  expect(result.rows[0]).toMatchObject({
    weekday: 1,
    startTime: '09:00',
    endTime: '10:30',
    effectiveFrom: '2026-08-08',
  });
  expect(result.rows[1]).toMatchObject({
    weekday: 4,
    effectiveFrom: '2026-09-01',
    effectiveTo: '2026-11-30',
  });
});
it('reports bad rows and unfamiliar sheets rather than silently dropping them', async () => {
  const result = await parse(
    'Subject,Day,Start time,End time,Effective from\nDSA,Monday,10:00,09:00,\nWEB,Bogus,09:00,10:00,\nDSA,Tue,09:00,10:00,01/01/2026',
  );
  expect(result.errors).toHaveLength(3);
  expect(result.rows).toEqual([]);
  expect((await parse('Monday,Tuesday\nDSA,WEB')).errors[0]?.message).toContain(
    'columns',
  );
});
it('reads native Excel time cells and preserves every data sheet', async () => {
  const book = new ExcelJS.Workbook();
  for (const name of ['Monday', 'Friday']) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(['Subject', 'Day', 'Start time', 'End time']);
    sheet.addRow(['DSA', name, 9 / 24, 10 / 24]);
    sheet.getCell('C2').numFmt = 'h:mm AM/PM';
    sheet.getCell('D2').numFmt = 'h:mm AM/PM';
  }
  const result = await parseBatchTimetable(
    {
      originalname: 'weekly.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    } as never,
    '2026-08-08',
    '2026-12-08',
  );
  expect(result.errors).toEqual([]);
  expect(result.rows.map((r) => r.weekday)).toEqual([1, 5]);
  expect(result.rows.every((r) => r.startTime === '09:00')).toBe(true);
});
it('validates times without guessing ambiguous values', () => {
  expect(importTime('12:00 AM')).toBe('00:00');
  expect(importTime('12:00 PM')).toBe('12:00');
  expect(importTime(0.5)).toBe('12:00');
  for (const v of ['9', '25:00', '0:00 PM', '9:70', 1])
    expect(() => importTime(v)).toThrow();
});
