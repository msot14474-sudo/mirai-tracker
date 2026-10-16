import {
  buildLessonPlanCsv,
  buildLessonPlanWorkbook,
} from './lesson-plan.template';
import { parseLessonPlanFile } from './lesson-plan.parser';

describe('lesson-plan file parser', () => {
  it('parses the complete fictional CSV lesson plan and its exam scopes', async () => {
    const preview = await parseLessonPlanFile(
      file('sample.csv', buildLessonPlanCsv()),
    );

    expect(preview.valid).toBe(true);
    expect(preview.counts).toEqual({
      rows: 8,
      units: 3,
      topics: 8,
      totalPlannedMinutes: 1380,
    });
    expect(preview.rows[0]?.examNames).toEqual([
      'Sample Mid-term 2026',
      'Sample End-term 2026',
    ]);
  });

  it('parses the supplied Excel workbook', async () => {
    const buffer = await buildLessonPlanWorkbook();
    const preview = await parseLessonPlanFile(file('sample.xlsx', buffer));

    expect(preview.valid).toBe(true);
    expect(preview.counts.topics).toBe(8);
  });

  it('rejects spreadsheet formulas', async () => {
    const preview = await parseLessonPlanFile(
      file('formula.csv', `${header()}\n1,Unit,,1,=HYPERLINK(test),,60,`),
    );

    expect(preview.valid).toBe(false);
    expect(preview.issues[0]?.errorMessage).toContain('formulas');
  });

  it('rejects duplicate topic sequences inside one unit', async () => {
    const preview = await parseLessonPlanFile(
      file(
        'duplicate.csv',
        `${header()}\n1,Unit,,1,First,,60,\n1,Unit,,1,Second,,60,`,
      ),
    );

    expect(preview.valid).toBe(false);
    expect(
      preview.issues.some((issue) => issue.errorMessage.includes('unique')),
    ).toBe(true);
  });

  it('requires contiguous unit and topic sequences', async () => {
    const preview = await parseLessonPlanFile(
      file(
        'gaps.csv',
        `${header()}\n1,Unit one,,2,Topic two,,60,\n3,Unit three,,1,Topic one,,60,`,
      ),
    );

    expect(preview.valid).toBe(false);
    expect(
      preview.issues.filter((issue) => issue.errorMessage.includes('no gaps')),
    ).toHaveLength(2);
  });

  it('rejects unsupported files and missing columns', async () => {
    const unsupported = await parseLessonPlanFile(file('plan.txt', 'content'));
    const missing = await parseLessonPlanFile(
      file('plan.csv', 'unit_sequence\n1'),
    );

    expect(unsupported.issues[0]?.errorMessage).toContain('.csv or .xlsx');
    expect(missing.valid).toBe(false);
    expect(
      missing.issues.some((issue) => issue.columnName === 'topic_title'),
    ).toBe(true);
  });
});

function header() {
  return 'unit_sequence,unit_title,unit_description,topic_sequence,topic_title,topic_description,planned_minutes,exam_names';
}

function file(name: string, value: string | Buffer) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return {
    originalname: name,
    mimetype: name.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv',
    size: buffer.length,
    buffer,
  };
}

it('reads more than 1,000 topics without truncating the plan', async () => {
  const rows = Array.from(
    { length: 1001 },
    (_, i) => `1,Unit,,${i + 1},Topic ${i + 1},,60,`,
  );
  const preview = await parseLessonPlanFile(
    file('large.csv', [header(), ...rows].join('\n')),
  );
  expect(preview.valid).toBe(true);
  expect(preview.rows).toHaveLength(1001);
  expect(preview.rows[1000]?.topicTitle).toBe('Topic 1001');
});
