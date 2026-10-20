import ExcelJS from 'exceljs';
import {
  bundleColumns,
  bundleTemplate,
  readBundle,
} from './semester-bundle.parser';
import {
  classRate,
  visitingLedgerSchema,
  visitingRateSchema,
} from './visiting-faculty.service';
const context = {
  start: '2025-01-01',
  end: '2025-06-30',
  campusCode: 'HI-TECH',
  semesterName: 'Semester 1',
};
const csv = (name: string, text: string) => ({
  originalname: name,
  buffer: Buffer.from(text),
  mimetype: 'text/csv',
  size: Buffer.byteLength(text),
});

describe('full semester files', () => {
  it('reads CSV dates deterministically, keeps extra columns and rejects cross-campus data', async () => {
    const result = await readBundle(
      [
        csv(
          'Calendar.csv',
          'date,title,type,extra,campus_code\n2025-01-26,Republic Day,HOLIDAY,Source note,HI-TECH\n2025-02-01,Other,HOLIDAY,retain,OTHER',
        ),
      ],
      context,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.original.extra).toBe('Source note');
    expect(result.issues.map((i) => i.message)).toContain(
      'This row belongs to another campus.',
    );
    expect(result.warnings).toHaveLength(2);
  });
  it('reads every row and sheet, ignores Read Me, and preserves Excel dates and times', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Read Me').addRow(['instructions']);
    const sheet = book.addWorksheet('Calendar');
    sheet.addRow(bundleColumns.Calendar);
    for (let i = 1; i <= 42; i++)
      sheet.addRow([
        new Date(Date.UTC(2025, 0, i)),
        null,
        `Event ${i}`,
        'EVENT',
        'true',
      ]);
    const times = book.addWorksheet('Timetable');
    times.addRow(bundleColumns.Timetable);
    times.addRow([
      'A',
      'WEB',
      '',
      'Mon',
      new Date('1899-12-30T09:00:00Z'),
      new Date('1899-12-30T10:00:00Z'),
    ]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    const result = await readBundle(
      [
        {
          originalname: 'Campus.xlsx',
          buffer,
          mimetype: 'application/octet-stream',
          size: buffer.length,
        },
      ],
      context,
    );
    expect(result.issues).toEqual([]);
    expect(result.counts.Calendar).toBe(42);
    expect(result.counts.Timetable).toBe(1);
    expect(result.rows.at(-1)!.values.start_time).toBe('09:00');
    expect(result.skippedSheets).toHaveLength(1);
  });
  it('blocks ambiguous dates, bad money, unsaved formulas and invalid ranges', async () => {
    const result = await readBundle(
      [
        csv(
          'Calendar.csv',
          'date,end_date,title,type\n01/02/2025,2025-01-01,Holiday,HOLIDAY',
        ),
        csv(
          'Rates.csv',
          'faculty_email,effective_from,rate_per_class\na@example.com,2025-01-01,-10',
        ),
      ],
      context,
    );
    expect(result.issues.some((i) => i.message.includes('ambiguous'))).toBe(
      true,
    );
    expect(result.issues.some((i) => i.message.includes('nonnegative'))).toBe(
      true,
    );
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Rates');
    sheet.addRow(bundleColumns.Rates);
    sheet.addRow(['a@example.com', '2025-01-01', { formula: '100+200' }]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    expect(
      (
        await readBundle(
          [
            {
              originalname: 'Rates.xlsx',
              buffer,
              mimetype: 'x',
              size: buffer.length,
            },
          ],
          context,
        )
      ).issues.some((i) => i.message.includes('save calculated')),
    ).toBe(true);
  });
  it('allows DMY explicitly and flags unrecognized sheets without dropping them', async () => {
    const result = await readBundle(
      [
        csv(
          'Calendar.csv',
          'date,title,type,date_format\n01/02/2025,Event,EVENT,DMY',
        ),
        csv('Unknown.csv', 'a,b\nx,y'),
      ],
      context,
    );
    expect(result.rows[0]!.values.date).toBe('2025-02-01');
    expect(result.issues).toHaveLength(1);
  });
  it('provides a blank workbook with all ten datasets and no demo records', async () => {
    const buffer = await bundleTemplate('xlsx');
    const result = await readBundle(
      [
        {
          originalname: 'template.xlsx',
          buffer,
          mimetype: 'x',
          size: buffer.length,
        },
      ],
      context,
    );
    expect(result.rows).toHaveLength(0);
    expect(Object.keys(result.counts)).toHaveLength(10);
    expect(result.issues[0]!.message).toContain('No data rows');
  });
});
describe('per-class honorarium', () => {
  it('uses the rate effective on the class date without inventing a missing rate', () => {
    const rates = [
      { effectiveFrom: new Date('2025-01-01'), ratePerClass: 1500 },
      { effectiveFrom: new Date('2025-02-01'), ratePerClass: 2000 },
    ];
    expect(classRate(rates, new Date('2024-12-31'))).toBeNull();
    expect(classRate(rates, new Date('2025-01-15'))).toBe(1500);
    expect(classRate(rates, new Date('2025-02-01'))).toBe(2000);
  });
  it('rejects invalid amounts and fractional paise', () => {
    const base = { staffProfileId: '11111111-1111-4111-8111-111111111111' };
    expect(
      visitingRateSchema.safeParse({
        ...base,
        effectiveFrom: '2025-01-01',
        ratePerClass: 100.005,
      }).success,
    ).toBe(false);
    expect(
      visitingLedgerSchema.safeParse({
        ...base,
        date: '2025-01-01',
        kind: 'PAYMENT',
        category: 'Payment',
        amount: 0,
      }).success,
    ).toBe(false);
  });
});
