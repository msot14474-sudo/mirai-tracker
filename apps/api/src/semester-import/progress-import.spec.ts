import ExcelJS from 'exceljs';
import { RedisService } from '../redis/redis.service';
import { ForbiddenException } from '@nestjs/common';
import {
  normalizeProgress,
  progressSheets,
  suggestMapping,
  ProgressImportService,
} from './progress-import.service';
import { PrismaService } from '../database/prisma.service';
import { AccessPolicyService } from '../auth/access-policy.service';
import { AuthenticatedUser } from '../auth/auth.types';
const sheets = [
  {
    name: 'Course Progression',
    rows: [
      ['Web Development'],
      [
        'Topic',
        'Planned hr',
        '% Complete',
        'Status',
        'Planned Date',
        'Date Taught',
        'Homework',
      ],
      ['HTML', '1.5', '1', 'Completed', '2026-08-24', '2026-08-24', 'Practice'],
      ['CSS', '2', '0.5', 'In Progress', '2026-08-25', '', 'Project'],
      ['OFF', '0', '0', 'Holiday', '2026-08-26', '', ''],
      ['Total', '[Formula without saved result]', '', '', '', '', ''],
    ],
  },
];
const mapping = suggestMapping(sheets);
it('recognizes tracker columns and preserves completion, extra columns and non-topic rows', () => {
  expect(mapping.header).toBe(2);
  expect(mapping.percentScale).toBe('fraction');
  const result = normalizeProgress(sheets, mapping, '2026-08-01', '2026-12-31');
  expect(result.valid).toBe(true);
  expect(result.counts).toEqual({
    topics: 2,
    completed: 1,
    minutes: 210,
    nonTeachingRows: 2,
  });
  expect(result.topics[1]?.completion).toBe(50);
  expect(result.topics[0]?.description).toContain(
    'Homework [column 7]: Practice',
  );
  expect(result.preserved.join('\n')).toContain('Web Development');
  expect(result.preserved.join('\n')).toContain('Total');
});
it('rejects dates outside the actual semester and conflicting completion', () => {
  expect(
    normalizeProgress(sheets, mapping, '2026-09-01', '2026-12-31').valid,
  ).toBe(false);
  const copy = structuredClone(sheets);
  copy[0]!.rows[2]![2] = '0.5';
  expect(
    normalizeProgress(copy, mapping, '2026-08-01', '2026-12-31').issues[0],
  ).toContain('conflicts');
});
it('rejects overlapping column mappings', () => {
  expect(() =>
    normalizeProgress(
      sheets,
      { ...mapping, hours: mapping.topic },
      '2026-01-01',
      '2026-12-31',
    ),
  ).toThrow('different existing column');
});
it('reads CSV files without a Semester Setup sheet', async () => {
  const buffer = Buffer.from('Topic,Planned hr,Status\nHTML,1.5,Completed');
  const parsed = await progressSheets({
    buffer,
    originalname: 'progress.csv',
    mimetype: 'text/csv',
    size: buffer.length,
  });
  expect(
    normalizeProgress(
      parsed,
      suggestMapping(parsed),
      '2026-01-01',
      '2026-12-31',
    ).valid,
  ).toBe(true);
});
it('checks permissions before reading an offering', async () => {
  const prisma = { subjectOffering: { findUnique: jest.fn() } };
  const access = {
    assertGlobalManager: jest.fn(() => {
      throw new ForbiddenException();
    }),
  };
  const service = new ProgressImportService(
    prisma as unknown as PrismaService,
    access as unknown as AccessPolicyService,
    {} as RedisService,
  );
  await expect(
    service.preview({} as never, 'id', mapping, {} as AuthenticatedUser),
  ).rejects.toThrow(ForbiddenException);
  expect(prisma.subjectOffering.findUnique).not.toHaveBeenCalled();
});
it('refuses to replace an existing plan before any transaction', async () => {
  const prisma = {
    subjectOffering: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ lessonPlans: [{ id: 'existing' }] }),
    },
    $transaction: jest.fn(),
  };
  const service = new ProgressImportService(
    prisma as unknown as PrismaService,
    { assertGlobalManager: jest.fn() } as unknown as AccessPolicyService,
    {} as RedisService,
  );
  await expect(
    service.execute({} as never, 'id', mapping, {} as AuthenticatedUser),
  ).rejects.toThrow('already has a lesson plan');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('saves source completion and planned dates atomically without inventing lecture sessions', async () => {
  const tx = {
    $queryRaw: jest.fn(),
    lessonPlan: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({
        id: 'plan',
        units: [{ topics: [{ id: 'topic' }] }],
      }),
    },
    topicScheduleVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    subjectOffering: {
      findUnique: jest.fn().mockResolvedValue({
        lessonPlans: [],
        batch: {
          semester: {
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
          },
        },
      }),
    },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  const service = new ProgressImportService(
    prisma as unknown as PrismaService,
    { assertGlobalManager: jest.fn() } as unknown as AccessPolicyService,
    {} as RedisService,
  );
  const buffer = Buffer.from(
    'Topic,Planned hr,Status,Planned Date,Private note\nHTML,1.5,Completed,2026-08-24,exclude-this-value',
  );
  const file = {
    buffer,
    originalname: 'progress.csv',
    mimetype: 'text/csv',
    size: buffer.length,
  };
  const mapping = suggestMapping(await progressSheets(file));
  const result = await service.execute(
    file,
    'offering',
    { ...mapping, excludedColumns: [4] },
    {
      id: 'actor',
    } as AuthenticatedUser,
  );
  expect(result.planId).toBe('plan');
  expect(
    tx.lessonPlan.create.mock.calls[0]![0].data.units.create.topics.create[0],
  ).toMatchObject({
    plannedMinutes: 90,
    currentCompletionPercentage: 100,
    status: 'COMPLETED',
  });
  expect(
    tx.topicScheduleVersion.create.mock.calls[0]![0].data.entries.create[0],
  ).toMatchObject({
    topicId: 'topic',
    plannedStartDate: new Date('2026-08-24'),
  });
  expect(
    tx.auditEvent.create.mock.calls[0]![0].data.metadata.sourceWorkbook[0]
      .rows[1],
  ).toEqual(['HTML', '1.5', 'Completed', '2026-08-24', '']);
  expect(JSON.stringify(tx.auditEvent.create.mock.calls)).not.toContain(
    'exclude-this-value',
  );
});

it('returns automatic columns when AI dependencies are unavailable', async () => {
  const service = new ProgressImportService(
    {} as PrismaService,
    { assertGlobalManager: jest.fn() } as unknown as AccessPolicyService,
    {
      incrementWithExpiry: jest.fn().mockRejectedValue(new Error('offline')),
    } as unknown as RedisService,
  );
  const buffer = Buffer.from('Topic,Planned hr,Status\nHTML,1.5,Completed');
  const result = await service.inspect(
    {
      buffer,
      originalname: 'progress.csv',
      mimetype: 'text/csv',
      size: buffer.length,
    },
    true,
    { id: 'actor' } as AuthenticatedUser,
  );
  expect(result.matching).toBe('automatic');
  expect(result.mapping.topic).toBe(0);
  expect(result.mapping.hours).toBe(1);
  expect(result.sheets[0]?.rows[1]?.[0]).toBe('HTML');
});

it('keeps reading a file if the AI provider rejects the request', async () => {
  const old = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = 'test-only';
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 503 }));
  try {
    const service = new ProgressImportService(
      {} as PrismaService,
      { assertGlobalManager: jest.fn() } as unknown as AccessPolicyService,
      {
        incrementWithExpiry: jest.fn().mockResolvedValue(1),
      } as unknown as RedisService,
    );
    const buffer = Buffer.from('Topic,Planned hr\nHTML,1.5');
    const result = await service.inspect(
      {
        buffer,
        originalname: 'progress.csv',
        mimetype: 'text/csv',
        size: buffer.length,
      },
      true,
      { id: 'actor' } as AuthenticatedUser,
    );
    expect(result.matching).toBe('automatic');
    expect(result.mapping.hours).toBe(1);
  } finally {
    fetch.mockRestore();
    if (old === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = old;
  }
});

it('reads files beyond the old row, column, cell-text and byte limits', async () => {
  const headings = [
    'Topic',
    'Planned hr',
    ...Array.from({ length: 100 }, (_, i) => `Note${i}`),
  ];
  const rows = Array.from({ length: 1001 }, (_, i) =>
    [
      `Topic ${i}`,
      '1',
      'x'.repeat(i === 0 ? 9000 : 6000),
      ...Array(99).fill(''),
    ].join(','),
  );
  const buffer = Buffer.from([headings.join(','), ...rows].join('\n'));
  expect(buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  const sheets = await progressSheets({
    buffer,
    originalname: 'large.csv',
    mimetype: 'text/csv',
    size: buffer.length,
  });
  const preview = normalizeProgress(
    sheets,
    suggestMapping(sheets),
    '2026-01-01',
    '2026-12-31',
  );
  expect(preview.valid).toBe(true);
  expect(preview.topics).toHaveLength(1001);
  expect(preview.topics[0]?.description).toContain('x'.repeat(9000));
});

it('accepts named dates and explicit numeric date order while rejecting impossible dates', () => {
  const copy = structuredClone(sheets);
  copy[0]!.rows[2]![4] = '24-Aug-2026';
  copy[0]!.rows[2]![5] = '24/08/2026';
  let result = normalizeProgress(copy, mapping, '2026-01-01', '2026-12-31');
  expect(result.valid).toBe(true);
  expect(result.topics[0]?.plannedDate).toBe('2026-08-24');
  expect(result.topics[0]?.taughtDate).toBe('2026-08-24');
  copy[0]!.rows[2]![5] = '08/24/2026';
  result = normalizeProgress(
    copy,
    { ...mapping, dateOrder: 'month-first' },
    '2026-01-01',
    '2026-12-31',
  );
  expect(result.valid).toBe(true);
  copy[0]!.rows[2]![4] = '31-Feb-2026';
  expect(
    normalizeProgress(copy, mapping, '2026-01-01', '2026-12-31').issues.join(
      ' ',
    ),
  ).toContain('Invalid date');
});
it('retains every column including blanks and every nonempty source row in the preview', () => {
  const copy = structuredClone(sheets);
  copy[0]!.rows[1]!.push('Classwork', 'Homework');
  copy[0]!.rows[2]!.push('', 'Extra task');
  const result = normalizeProgress(copy, mapping, '2026-01-01', '2026-12-31');
  expect(result.source.columns).toHaveLength(9);
  expect(result.source.rows).toHaveLength(4);
  expect(result.source.rows[0]?.values.at(-1)).toBe('Extra task');
  expect(result.topics[0]?.description).toContain(
    'Classwork [column 8]: (blank)',
  );
  expect(result.topics[0]?.description).toContain(
    'Homework [column 9]: Extra task',
  );
});
it('rejects a data row mistaken for headings and identifies the correct row', () => {
  expect(() =>
    normalizeProgress(
      sheets,
      { ...mapping, header: 3 },
      '2026-01-01',
      '2026-12-31',
    ),
  ).toThrow('headings are on row 2');
});
it('keeps the detected header when AI mistakenly chooses the first data row', async () => {
  const old = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = 'test-only';
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            ...mapping,
            sheet: 'sheet1',
            header: 2,
            topic: 0,
            hours: 1,
            completion: -1,
            status: -1,
            plannedDate: -1,
            taughtDate: -1,
          }),
        },
      }),
    ),
  );
  try {
    const service = new ProgressImportService(
      {} as PrismaService,
      { assertGlobalManager: jest.fn() } as unknown as AccessPolicyService,
      {
        incrementWithExpiry: jest.fn().mockResolvedValue(1),
      } as unknown as RedisService,
    );
    const buffer = Buffer.from('Topic,Planned hr\nHTML,1.5');
    const result = await service.inspect(
      {
        buffer,
        originalname: 'file.csv',
        mimetype: 'text/csv',
        size: buffer.length,
      },
      true,
      { id: 'actor' } as AuthenticatedUser,
    );
    expect(result.mapping.header).toBe(1);
  } finally {
    fetch.mockRestore();
    if (old === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = old;
  }
});

it('retains Excel formulas with and without cached results', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Progress');
  sheet.addRow(['Topic', 'Planned hr', 'Cumulative hours', 'Hours earned']);
  sheet.addRow([
    'HTML',
    1.5,
    { formula: 'B2' },
    { formula: 'B2', result: 1.5 },
  ]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const parsed = await progressSheets({
    buffer,
    originalname: 'formulas.xlsx',
    size: buffer.length,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  expect(parsed[0]?.formulas).toEqual({ C2: 'B2', D2: 'B2' });
  expect(parsed[0]?.rows[1]?.[2]).toContain('=B2');
  expect(parsed[0]?.rows[1]?.[3]).toBe('1.5');
  const preview = normalizeProgress(
    parsed,
    suggestMapping(parsed),
    '2026-01-01',
    '2026-12-31',
  );
  expect(preview.valid).toBe(true);
  expect(preview.warnings).toHaveLength(1);
});

it('excludes unwanted columns from notes, preview, and mapped values', () => {
  const copy = structuredClone(sheets);
  copy[0]!.rows[2]![5] = 'not a valid date';
  const result = normalizeProgress(
    copy,
    { ...mapping, excludedColumns: [5, 6] },
    '2026-01-01',
    '2026-12-31',
  );
  expect(result.valid).toBe(true);
  expect(result.topics[0]?.taughtDate).toBeNull();
  expect(result.source.columns.map((column) => column.name)).not.toContain(
    'Homework',
  );
  expect(JSON.stringify(result)).not.toContain('Practice');
  expect(JSON.stringify(result)).not.toContain('not a valid date');
  expect(result.topics[0]?.description).not.toContain('column 7');
});
it('refuses exclusion of required or nonexistent columns', () => {
  for (const excludedColumns of [[mapping.topic], [mapping.hours], [100]]) {
    expect(() =>
      normalizeProgress(
        sheets,
        { ...mapping, excludedColumns },
        '2026-01-01',
        '2026-12-31',
      ),
    ).toThrow();
  }
});

it('previews and imports directly into a selected semester, creating its course only on confirmation', async () => {
  const semester = {
    id: 'term',
    campusId: 'campus',
    status: 'ACTIVE',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-12-31'),
    campus: { active: true },
  };
  const tx = {
    $queryRaw: jest.fn(),
    semester: { findUniqueOrThrow: jest.fn().mockResolvedValue(semester) },
    track: {
      upsert: jest.fn().mockResolvedValue({ id: 'program', active: true }),
    },
    batch: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'batch' }),
    },
    subject: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'subject' }),
    },
    subjectOffering: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockResolvedValue({ id: 'offering', academicTrack: 'MIRAI' }),
    },
    lessonPlan: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({
        id: 'plan',
        units: [{ topics: [{ id: 'topic' }] }],
      }),
    },
    topicScheduleVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    semester: { findUnique: jest.fn().mockResolvedValue(semester) },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  const service = new ProgressImportService(
    prisma as unknown as PrismaService,
    { assertGlobalManager: jest.fn() } as unknown as AccessPolicyService,
    {} as RedisService,
  );
  const buffer = Buffer.from(
    'Topic,Planned hr,Status,Planned Date,Date Taught\nHTML,1.5,Completed,24-Aug-2026,25-Aug-2026',
  );
  const file = {
    buffer,
    originalname: 'progress.csv',
    mimetype: 'text/csv',
    size: buffer.length,
  };
  const map = suggestMapping(await progressSheets(file));
  const destination = {
    semesterId: 'term',
    subjectName: 'Web',
    batchName: 'Alpha',
    programName: 'MIRAI' as const,
  };
  const user = { id: 'actor' } as AuthenticatedUser;
  const preview = await service.preview(
    file,
    '',
    map,
    user,
    'campus',
    'term',
    destination,
  );
  expect(preview.valid).toBe(true);
  expect(preview.topics[0]?.taughtDate).toBe('2026-08-25');
  expect(prisma.$transaction).not.toHaveBeenCalled();
  await service.execute(file, '', map, user, 'campus', 'term', destination);
  expect(tx.batch.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ semesterId: 'term', name: 'Alpha' }),
    }),
  );
  expect(tx.subject.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ campusId: 'campus', name: 'Web' }),
    }),
  );
  expect(tx.topicScheduleVersion.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        entries: {
          create: [
            expect.objectContaining({
              plannedStartDate: new Date('2026-08-24'),
            }),
          ],
        },
      }),
    }),
  );
  await expect(
    service.preview(file, '', map, user, 'another-campus', 'term', destination),
  ).rejects.toThrow('Choose an active semester');
  semester.status = 'ARCHIVED';
  await expect(
    service.preview(file, '', map, user, 'campus', 'term', destination),
  ).rejects.toThrow('Choose an active semester');
});
it('rejects an existing subject from a different selected semester', async () => {
  const service = new ProgressImportService(
    {
      subjectOffering: {
        findUnique: jest.fn().mockResolvedValue({
          lessonPlans: [],
          batch: {
            semester: { id: 'other', campusId: 'campus', status: 'ACTIVE' },
          },
        }),
      },
    } as unknown as PrismaService,
    { assertGlobalManager: jest.fn() } as unknown as AccessPolicyService,
    {} as RedisService,
  );
  await expect(
    service.preview(
      {} as never,
      'offering',
      mapping,
      {} as AuthenticatedUser,
      'campus',
      'selected',
    ),
  ).rejects.toThrow('selected active semester');
});
