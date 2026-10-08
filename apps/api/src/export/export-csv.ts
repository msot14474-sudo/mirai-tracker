export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => CsvValue;
};

const spreadsheetFormula = /^[=+\-@]/;

export function escapeCsvCell(value: CsvValue) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (spreadsheetFormula.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function buildCsv<Row>(rows: Row[], columns: CsvColumn<Row>[]) {
  const lines = [
    columns.map((column) => escapeCsvCell(column.header)).join(','),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvCell(column.value(row))).join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function csvBuffer(csv: string) {
  return Buffer.from(`\uFEFF${csv}`, 'utf8');
}
