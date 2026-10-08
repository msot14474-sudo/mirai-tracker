import ExcelJS from 'exceljs';
import { lessonPlanColumns } from './lesson-plan.types';

export const sampleLessonPlanRows = [
  [
    '1',
    'Linear Data Structures',
    'Core sequential structures',
    '1',
    'Arrays',
    'Indexing, traversal and applications',
    '120',
    'Sample Mid-term 2026|Sample End-term 2026',
  ],
  [
    '1',
    'Linear Data Structures',
    'Core sequential structures',
    '2',
    'Linked Lists',
    'Singly and doubly linked lists',
    '180',
    'Sample Mid-term 2026|Sample End-term 2026',
  ],
  [
    '1',
    'Linear Data Structures',
    'Core sequential structures',
    '3',
    'Stacks and Queues',
    'LIFO and FIFO applications',
    '180',
    'Sample Mid-term 2026|Sample End-term 2026',
  ],
  [
    '2',
    'Trees and Graphs',
    'Non-linear structures',
    '1',
    'Trees',
    'Traversal and search trees',
    '240',
    'Sample End-term 2026',
  ],
  [
    '2',
    'Trees and Graphs',
    'Non-linear structures',
    '2',
    'Graph Traversal',
    'Breadth-first and depth-first search',
    '240',
    'Sample End-term 2026',
  ],
  [
    '3',
    'Algorithm Analysis',
    'Analysis and common techniques',
    '1',
    'Sorting',
    'Comparison sorting algorithms',
    '180',
    'Sample End-term 2026',
  ],
  [
    '3',
    'Algorithm Analysis',
    'Analysis and common techniques',
    '2',
    'Searching',
    'Linear and binary search',
    '120',
    'Sample End-term 2026',
  ],
  [
    '3',
    'Algorithm Analysis',
    'Analysis and common techniques',
    '3',
    'Complexity',
    'Time and space complexity',
    '120',
    'Sample End-term 2026',
  ],
] as const;

export function buildLessonPlanCsv() {
  return [lessonPlanColumns, ...sampleLessonPlanRows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

export async function buildLessonPlanWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mirai Course Progression Tracker';
  workbook.created = new Date('2026-10-07T00:00:00.000Z');
  const instructions = workbook.addWorksheet('Instructions');
  instructions.addRows([
    ['M07 · Lesson plan and exam scope'],
    ['Upload this workbook from the Lesson plan workspace.'],
    [
      'Keep column names unchanged. Planned teaching time is entered as whole minutes.',
    ],
    [
      'Separate multiple exact exam-window names with |. Leave exam_names blank when a topic is outside every exam scope.',
    ],
    [
      'Unit sequences and topic sequences within each unit must start at 1 without gaps.',
    ],
  ]);
  instructions.getColumn(1).width = 110;
  instructions.getRow(1).font = { bold: true, size: 16 };

  const plan = workbook.addWorksheet('Lesson Plan');
  plan.addRow([...lessonPlanColumns]);
  plan.addRows(sampleLessonPlanRows.map((row) => [...row]));
  plan.views = [{ state: 'frozen', ySplit: 1 }];
  plan.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: lessonPlanColumns.length },
  };
  plan.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  plan.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1C5A49' },
  };
  plan.columns.forEach((column) => {
    column.width = Math.min(
      38,
      Math.max(
        16,
        ...(column.values ?? [])
          .slice(1)
          .map((value) => String(value ?? '').length + 2),
      ),
    );
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
