import {
  CalendarFileService,
  calendarEntrySchema,
  validateCalendarEntries,
} from './calendar-file.service';
import { createHash } from 'node:crypto';
import { Workbook } from 'exceljs';
const entry = (changes = {}) =>
  calendarEntrySchema.parse({
    title: 'Holiday',
    start: '2026-10-02',
    end: '2026-10-02',
    kind: 'HOLIDAY',
    teachingAllowed: false,
    ...changes,
  });
const user = { id: 'user' } as any;
describe('Calendar file import protections', () => {
  it('rejects impossible and ambiguous dates', () => {
    expect(() => entry({ start: '2026-02-30' })).toThrow();
    expect(() => entry({ start: '02/10/26' })).toThrow();
  });
  it('allows partial and unordered date lists without filling gaps', () => {
    expect(() =>
      validateCalendarEntries(
        [entry(), entry({ start: '2026-09-01', end: '2026-09-01' })],
        '2026-07-01',
        '2026-12-31',
      ),
    ).not.toThrow();
  });
  it('rejects dates outside the semester, reversed ranges, duplicate dates and missing exam deadlines', () => {
    for (const entries of [
      [entry({ start: '2027-01-01', end: '2027-01-01' })],
      [entry({ start: '2026-10-03' })],
      [entry(), entry()],
      [entry({ kind: 'EXAM' })],
    ]) {
      expect(() =>
        validateCalendarEntries(entries, '2026-07-01', '2026-12-31'),
      ).toThrow();
    }
  });
  function fixture(verified = true) {
    const semester = {
      id: 'semester',
      campusId: 'campus',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      calendarDays: [],
      examWindows: [],
    };
    const draft = {
      semesterId: 'semester',
      fingerprint: createHash('sha256')
        .update(JSON.stringify(semester))
        .digest('hex'),
      entries: [entry()],
      verified,
      fileName: 'calendar.csv',
    };
    const db: any = {
      semester: { findUnique: jest.fn().mockResolvedValue(semester) },
      importJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      calendarDayOverride: { upsert: jest.fn() },
      auditEvent: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    const timetable = { regenerateSemester: jest.fn().mockResolvedValue({}) };
    const service = new CalendarFileService(
      db,
      { assertGlobalManager: jest.fn() } as any,
      { get: jest.fn().mockResolvedValue(JSON.stringify(draft)) } as any,
      timetable as any,
    );
    return { db, service, timetable };
  }
  it('requires verification and review before any writes', async () => {
    const { service, db } = fixture(false);
    await expect(
      service.commit('token', { reviewed: true, entries: [entry()] }, user),
    ).rejects.toThrow('second verification');
    expect(db.$transaction).not.toHaveBeenCalled();
    await expect(
      fixture().service.commit(
        'token',
        { reviewed: false, entries: [entry()] },
        user,
      ),
    ).rejects.toThrow();
  });
  it('updates only explicit dates and never rewrites the semester or clears unlisted dates', async () => {
    const { service, db, timetable } = fixture();
    await service.commit('token', { reviewed: true, entries: [entry()] }, user);
    expect(db.calendarDayOverride.upsert).toHaveBeenCalledTimes(1);
    expect(
      db.calendarDayOverride.upsert.mock.calls[0][0].where.semesterId_date.date.toISOString(),
    ).toBe('2026-10-02T00:00:00.000Z');
    expect(timetable.regenerateSemester).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate a committed import on retry', async () => {
    const { service, db } = fixture();
    db.importJob.findUnique.mockResolvedValue({ id: 'token' });
    await service.commit('token', { reviewed: true, entries: [entry()] }, user);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects stale previews before writing dates', async () => {
    const { service, db } = fixture();
    db.semester.findUnique
      .mockResolvedValueOnce({
        id: 'semester',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-12-31'),
      })
      .mockResolvedValueOnce({ changed: true });
    await expect(
      service.commit('token', { reviewed: true, entries: [entry()] }, user),
    ).rejects.toThrow('changed since');
    expect(db.calendarDayOverride.upsert).not.toHaveBeenCalled();
  });
});

describe('Calendar extraction and resumable AI verification', () => {
  const env = { ...process.env };
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });
  function fixture() {
    const store = new Map<string, string>();
    const semester = {
      id: 'semester',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      workingSaturdayRule: 'SECOND_AND_FOURTH',
      calendarDays: [],
      examWindows: [],
    };
    const redis = {
      get: jest.fn(async (key: string) => store.get(key)),
      setWithExpiry: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      incrementWithExpiry: jest.fn().mockResolvedValue(1),
      acquireLock: jest.fn().mockResolvedValue(true),
      consumeIfValue: jest.fn(),
    };
    const db = {
      semester: { findUnique: jest.fn().mockResolvedValue(semester) },
    };
    return {
      redis,
      store,
      service: new CalendarFileService(
        db as any,
        { assertGlobalManager: jest.fn() } as any,
        redis as any,
        {} as any,
      ),
      semester,
    };
  }
  const file = (text: string) =>
    ({ originalname: 'calendar.csv', buffer: Buffer.from(text) }) as any;
  it('offers an editable exam-start deadline when the source omits one and preserves existing deadlines', async () => {
    const { service, semester } = fixture();
    const csv = file('Date,Event,Category\n2026-09-28,1st Sessional,Exam');
    const first = await service.inspect(csv, 'semester', user);
    expect(first.entries[0]).toMatchObject({
      deadline: '2026-09-28',
      deadlineDefaulted: true,
    });
    (semester.examWindows as any[]).push({
      name: '1st Sessional',
      syllabusDeadline: new Date('2026-09-25'),
    });
    const second = await service.inspect(csv, 'semester', user);
    expect(second.entries[0]!.deadline).toBe('2026-09-25');
    expect((second.entries[0] as any).deadlineDefaulted).toBe(false);
  });

  it('reads a recognised CSV without calling AI or requiring an API key', async () => {
    delete process.env.OLLAMA_API_KEY;
    const fetch = jest.spyOn(globalThis, 'fetch');
    const { service } = fixture();
    const result = await service.inspect(
      file('Event,Date,Type\nGandhi Jayanti,2026-10-02,HOLIDAY'),
      'semester',
      user,
    );
    expect(result.verified).toBe(true);
    expect(result.method).toBe('direct');
    expect(result.entries[0]?.start).toBe('2026-10-02');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['csv', 'xlsx'])(
    'reads all 42 %s entries directly and keeps them when AI confirms only the 31 within the semester',
    async (extension) => {
      process.env.OLLAMA_API_KEY = 'test-only';
      const { service, semester } = fixture();
      semester.startDate = new Date('2026-08-08');
      semester.endDate = new Date('2026-12-08');
      const rows = Array.from({ length: 42 }, (_, i) => [
        new Date(
          Date.parse(i < 11 ? '2026-07-01' : '2026-08-08') +
            (i < 11 ? i : i - 11) * 86400000,
        )
          .toISOString()
          .slice(0, 10),
        `Calendar entry ${i + 1}`,
        'HOLIDAY',
      ]);
      const data = [['Date', 'Event', 'Type'], ...rows];
      const workbook = new Workbook();
      workbook.addWorksheet('Calendar').addRows(data);
      const input = {
        originalname: `calendar.${extension}`,
        buffer:
          extension === 'csv'
            ? Buffer.from(data.map((row) => row.join(',')).join('\n'))
            : Buffer.from(await workbook.xlsx.writeBuffer()),
      } as any;
      const ai = jest
        .spyOn(service as any, 'ai')
        .mockImplementation(async (...args: any[]) => ({
          entries: args[2].filter((e: any) => e.start >= '2026-08-08'),
          warnings: [],
        }));
      let preview = await service.inspect(input, 'semester', user);
      expect(preview.entries).toHaveLength(42);
      expect(preview.sourceCounts).toEqual({
        total: 42,
        withinSemester: 31,
        outsideSemester: 11,
        crossingBoundary: 0,
      });
      expect(preview.method).toBe('ai');
      expect(preview.progress.phase).toBe('checking');
      const sections = preview.progress.sections;
      for (let i = 0; i < sections; i++) {
        preview = await service.verify(preview.token, user);
      }
      expect(preview.verified).toBe(true);
      expect(preview.entries).toHaveLength(42);
      expect(preview.sourceCounts?.total).toBe(42);
      expect(ai).toHaveBeenCalledTimes(sections);
      expect(ai.mock.calls.every((call) => (call[2] as any[]).length > 0)).toBe(
        true,
      );
      expect(ai.mock.calls[0]![0]).toContain('Date: 2026-07-01');
      expect(preview.entries[0]!.concern).toContain('file values were kept');
    },
  );
  it('keeps completed AI work after a provider failure and resumes the next pass', async () => {
    const { service, redis } = fixture();
    const ai = jest
      .spyOn(service as any, 'ai')
      .mockResolvedValueOnce({ entries: [entry()], warnings: [] })
      .mockRejectedValueOnce(new Error('provider busy'))
      .mockResolvedValueOnce({ entries: [entry()], warnings: [] });
    const preview = await service.inspect(
      file('Calendar notices\nHoliday on 2 October 2026'),
      'semester',
      user,
    );
    const first = await service.verify(preview.token, user);
    expect(first.verified).toBe(false);
    expect(first.progress.completed).toBe(1);
    await expect(service.verify(preview.token, user)).rejects.toThrow(
      'provider busy',
    );
    const final = await service.verify(preview.token, user);
    expect(final.verified).toBe(true);
    expect(ai.mock.calls[2]?.[2]).toEqual([entry()]);
    expect(redis.consumeIfValue).toHaveBeenCalledTimes(3);
  });
  it('rejects parallel verification without processing the same draft twice', async () => {
    const { service, redis } = fixture();
    redis.acquireLock.mockResolvedValue(false);
    await expect(service.verify('token', user)).rejects.toThrow(
      'already being checked',
    );
    expect(redis.get).not.toHaveBeenCalled();
  });
  it('reports rejected credentials and does not send unsupported thinking options to other models', async () => {
    const { service, semester } = fixture();
    process.env.OLLAMA_API_KEY = 'test-only';
    process.env.AI_MODEL = 'example-model';
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    await expect((service as any).ai('source', semester)).rejects.toThrow(
      'credentials were rejected',
    );
    expect(
      JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)),
    ).not.toHaveProperty('think');
  });
  it('rejects truncated and malformed AI output instead of certifying incomplete dates', async () => {
    const { service, semester } = fixture();
    process.env.OLLAMA_API_KEY = 'test-only';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            done: true,
            done_reason: 'length',
            message: { content: '{}' },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ done: true, message: { content: 'invalid' } }),
        ),
      );
    await expect((service as any).ai('source', semester)).rejects.toThrow(
      'incomplete',
    );
    await expect((service as any).ai('source', semester)).rejects.toThrow(
      'invalid format',
    );
  });
});
