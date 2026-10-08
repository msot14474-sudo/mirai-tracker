import { buildCsv, csvBuffer, escapeCsvCell } from './export-csv';

describe('CSV export', () => {
  it('uses RFC 4180 line endings and escapes delimiters, quotes and newlines', () => {
    const csv = buildCsv(
      [{ name: 'Ada, "Faculty"', notes: 'Line one\nLine two' }],
      [
        { header: 'name', value: (row) => row.name },
        { header: 'notes', value: (row) => row.notes },
      ],
    );
    expect(csv).toBe(
      'name,notes\r\n"Ada, ""Faculty""","Line one\nLine two"\r\n',
    );
  });

  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@IMPORTXML(A1)'])(
    'neutralises spreadsheet formula input %s',
    (input) => expect(escapeCsvCell(input)).toBe(`'${input}`),
  );

  it('adds a UTF-8 BOM for spreadsheet compatibility', () => {
    expect(csvBuffer('नाम\r\n').subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
  });
});
