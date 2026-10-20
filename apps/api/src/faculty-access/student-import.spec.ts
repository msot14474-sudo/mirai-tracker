import ExcelJS from 'exceljs';
import { studentRows } from './student-import.service';
const csv = (s: string) =>
  ({ originalname: 'students.csv', buffer: Buffer.from(s) }) as any;
it('reads the Students sheet instead of Read Me and normalizes emails', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Read Me').addRow(['Instructions']);
  book.addWorksheet('Students').addRows([
    ['Name', 'Campus', 'Email'],
    ['Asha', 'HI-Tech', ' ASHA@example.edu '],
  ]);
  expect(
    await studentRows({
      originalname: 'students.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    } as any),
  ).toEqual({
    students: [
      { row: 2, name: 'Asha', campus: 'HI-Tech', email: 'asha@example.edu' },
    ],
    issues: [],
  });
});
it('reports every invalid or duplicate row and rejects missing columns', async () => {
  const result = await studentRows(
    csv(
      'Name,Campus,Email\nA,HI-Tech,a@example.edu\nB,HI-Tech,A@example.edu\nC,HI-Tech,invalid',
    ),
  );
  expect(result.issues.map((i) => i.row)).toEqual([3, 4]);
  await expect(studentRows(csv('Name,Campus\nA,HI-Tech'))).rejects.toThrow(
    'Email',
  );
});
