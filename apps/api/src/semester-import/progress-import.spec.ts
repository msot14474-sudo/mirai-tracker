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
  expect(result.topics[0]?.description).toContain('Homework: Practice');
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
    'Topic,Planned hr,Status,Planned Date\nHTML,1.5,Completed,2026-08-24',
  );
  const file = {
    buffer,
    originalname: 'progress.csv',
    mimetype: 'text/csv',
    size: buffer.length,
  };
  const mapping = suggestMapping(await progressSheets(file));
  const result = await service.execute(file, 'offering', { ...mapping }, {
    id: 'actor',
  } as AuthenticatedUser);
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
  expect(tx.auditEvent.create).toHaveBeenCalled();
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
