import {
  calendarChunks,
  calendarPdfText,
  mergeCalendarEntries,
  readCalendarDate,
  readCalendarSheets,
} from './calendar-reader';
const sheet = (rows: string[][]) => [{ name: 'Academic Calendar', rows }];
const semester = ['2026-07-01', '2026-12-31'] as const;
describe('Calendar file reading', () => {
  it('reads reordered CSV columns and dates directly, including explicit exam deadlines', () => {
    const result = readCalendarSheets(
      sheet([
        ['Event', 'End date', 'Category', 'Start date', 'Syllabus deadline'],
        ['Mid-Term', '8 Oct 2026', 'Exam', '05-Oct-2026', '04-Oct-2026'],
        ['Holiday', '', 'Holiday', '2026-08-15', ''],
      ]),
      ...semester,
    );
    expect(result.needsAi).toBe(false);
    expect(result.source).toContain('Event: Mid-Term');
    expect(result.source).toContain('Start date: 05-Oct-2026');
    expect(result.warnings).toEqual([]);
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start: '2026-10-05',
          end: '2026-10-08',
          kind: 'EXAM',
          examType: 'MID_TERM',
          deadline: '2026-10-04',
        }),
        expect.objectContaining({
          start: '2026-08-15',
          end: '2026-08-15',
          kind: 'HOLIDAY',
        }),
      ]),
    );
  });
  it('flags ambiguous, missing and impossible dates instead of inventing or silently dropping them', () => {
    const result = readCalendarSheets(
      sheet([
        ['Date', 'Event'],
        ['02/03/2026', 'Ambiguous'],
        ['2026-02-30', 'Impossible'],
        ['', 'No date'],
        ['2026-10-02', 'Valid'],
      ]),
      ...semester,
    );
    expect(result.entries).toHaveLength(1);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0]).toContain('row 2');
    expect(readCalendarDate('25-Dec', [2026, 2027])).toBeUndefined();
    expect(readCalendarDate('25/12/2026', [2026], 'MDY')).toBeUndefined();
  });
  it('supports explicit Indian date formats and named months without changing partial semester dates', () => {
    const result = readCalendarSheets(
      sheet([
        ['Date (DD/MM/YYYY)', 'Event'],
        ['02/10/2026', 'Gandhi Jayanti'],
        ['25-Dec', 'Christmas'],
      ]),
      ...semester,
    );
    expect(result.entries.map((e) => e.start)).toEqual([
      '2026-10-02',
      '2026-12-25',
    ]);
    expect(result.entries).toHaveLength(2);
  });
  it('keeps every worksheet and passes unknown layouts to AI', () => {
    const result = readCalendarSheets(
      [
        ...sheet([
          ['Date', 'Event'],
          ['2026-10-02', 'Holiday'],
        ]),
        {
          name: 'Other',
          rows: [['October notices'], ['Exams begin on the fifth']],
        },
      ],
      ...semester,
    );
    expect(result.needsAi).toBe(true);
    expect(result.source).toContain('October notices');
  });
  it('preserves side-by-side date/category/event relationships in PDF text', () => {
    const item = (str: string, x: number, y: number) => ({
      str,
      transform: [4, 0, 0, 4, x, y],
    });
    const text = calendarPdfText(
      [
        item('01-Aug', 320, 100),
        item('Club Day', 380, 100),
        item('25-Jul', 60, 100),
        item('Club Days', 100, 100.07),
        item('Presentations', 123, 100),
        item('Holiday', 350, 100),
        item('1', 60, 90),
        item('2', 100, 90),
      ],
      1,
    );
    expect(text).toContain(
      '25-Jul | Club Days | Presentations | 01-Aug | Holiday | Club Day',
    );
    expect(text).not.toContain('1 | 2');
  });
  it('chunks all rows with their header and year context, without truncating large sources', () => {
    const source = [
      'Page 1',
      'Line 1: October 2026',
      'Line 2: Date | Cat. | Event',
      ...Array.from(
        { length: 2000 },
        (_, i) => `Row ${i + 3}: 2026-10-02 | Event ${i}`,
      ),
    ].join('\n');
    const chunks = calendarChunks(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length < 5500)).toBe(true);
    expect(chunks[chunks.length - 1]).toContain('Event 1999');
    expect(chunks[1]).toContain('October 2026');
    expect(chunks[1]).toContain('Date | Cat. | Event');
  });
  it('combines consecutive exam rows across chunks without filling gaps or merging conflicting teaching rules', () => {
    const entries = readCalendarSheets(
      sheet([
        ['Date', 'Event', 'Type'],
        ['2026-11-02', 'PUT', 'EXAM'],
        ['2026-11-03', 'PUT', 'EXAM'],
        ['2026-11-05', 'PUT', 'EXAM'],
      ]),
      ...semester,
    ).entries;
    expect(entries.map((e) => [e.start, e.end])).toEqual([
      ['2026-11-02', '2026-11-03'],
      ['2026-11-05', '2026-11-05'],
    ]);
    expect(
      mergeCalendarEntries([
        entries[0]!,
        { ...entries[0]!, teachingAllowed: true },
      ]),
    ).toHaveLength(2);
  });
});

import { reconcileCalendarEntries } from './calendar-reader';
it('retains every structured source row when AI misses or changes a date', () => {
  const source = readCalendarSheets(
    [
      {
        name: 'Calendar',
        rows: [
          ['Date', 'Event', 'Category'],
          ['2026-09-28', 'Sessional', 'Exam'],
          ['2026-10-02', 'Gandhi Jayanti', 'Holiday'],
        ],
      },
    ],
    '2026-07-18',
    '2026-12-18',
  ).entries;
  const result = reconcileCalendarEntries(
    source,
    [{ ...source[0]!, start: '2026-09-29', end: '2026-09-29' }],
    true,
  );
  expect(result).toHaveLength(2);
  expect(result.map((entry) => entry.start)).toEqual([
    '2026-09-28',
    '2026-10-02',
  ]);
  expect(result[0]!.concern).toContain('file values were kept');
});
it('skips undated legend sheets while keeping dated tables', () => {
  const result = readCalendarSheets(
    [
      {
        name: 'Academic Calendar',
        rows: [
          ['Date', 'Event'],
          ['2026-10-02', 'Holiday'],
        ],
      },
      {
        name: 'Legend',
        rows: [
          ['Category / Legend item', 'Meaning / Notes'],
          ['Exam', 'Examination'],
        ],
      },
    ],
    '2026-07-18',
    '2026-12-18',
  );
  expect(result.needsAi).toBe(false);
  expect(result.entries).toHaveLength(1);
  expect(result.source).not.toContain('Sheet: Legend');
  expect(result.warnings).toEqual([]);
});
