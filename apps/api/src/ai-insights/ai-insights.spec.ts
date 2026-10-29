import { AiConversationService } from './ai-conversation.service';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AiContextService, insightScope } from './ai-context.service';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightsController } from './ai-insights.controller';
const user = (role: UserRole): AuthenticatedUser => ({
  id: 'u',
  name: 'Test',
  email: 'private@example.test',
  roles: [{ role, campusId: 'campus-a' }],
  staffProfileId: 'staff-a',
  studentProfile: null,
});
function setup(withPlan = true) {
  const offering = {
    id: 'offering-a',
    subject: { code: 'DSA', name: 'Data Structures' },
    batch: {
      name: 'Batch A',
      semester: {
        name: 'Semester 1',
        campus: { id: 'campus-a', name: 'Hi-Tech', timezone: 'Asia/Kolkata' },
        examWindows: [],
      },
    },
    faculty: [],
    lessonPlans: withPlan
      ? [
          {
            version: 1,
            status: 'ACTIVE',
            units: [
              {
                title: 'Linear structures',
                topics: [
                  {
                    id: 't1',
                    title: 'Arrays',
                    plannedMinutes: 100,
                    currentCompletionPercentage: 50,
                    status: 'IN_PROGRESS',
                    examScopes: [],
                  },
                  {
                    id: 't2',
                    title: 'Lists',
                    plannedMinutes: 100,
                    currentCompletionPercentage: 0,
                    status: 'NOT_STARTED',
                    examScopes: [],
                  },
                ],
              },
            ],
          },
        ]
      : [],
    scheduleVersions: [
      {
        entries: [{ topicId: 't1', plannedFinishDate: new Date('2020-01-01') }],
      },
    ],
  };
  const db = {
    campus: { findMany: jest.fn().mockResolvedValue([{ id: 'campus-a', name: 'Hi-Tech', timezone: 'Asia/Kolkata' }]) },
    semester: { findMany: jest.fn().mockResolvedValue([{ name: 'Semester 1', startDate: new Date('2026-08-01'), endDate: new Date('2026-12-01') }]) },
    subject: { findMany: jest.fn().mockResolvedValue([{ code: 'WEB', name: 'Web Development' }]) },
    subjectOffering: { findMany: jest.fn().mockResolvedValue([offering]) },
    scheduledSession: {
      groupBy: jest
        .fn()
        .mockResolvedValueOnce([
          {
            offeringId: 'offering-a',
            status: 'COMPLETED',
            _count: { _all: 2 },
          },
        ])
        .mockResolvedValueOnce([
          { offeringId: 'offering-a', _count: { _all: 1 } },
        ]),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    lectureReview: {
      groupBy: jest.fn().mockResolvedValue([
        { understood: false, _count: { _all: 3 } },
        { understood: true, _count: { _all: 2 } },
      ]),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return { db, context: new AiContextService(db as unknown as PrismaService) };
}
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OLLAMA_API_KEY;
});
it('restricts campus managers and faculty; students cannot use the service', () => {
  expect(insightScope(user('ADMIN'))).toEqual({});
  expect(insightScope(user('CAMPUS_MANAGER'))).toEqual({
    OR: [{ batch: { semester: { campusId: { in: ['campus-a'] } } } }],
  });
  expect(insightScope(user('FACULTY'))).toEqual({
    OR: [{ faculty: { some: { staffProfileId: 'staff-a', active: true } } }],
  });
  expect(() => insightScope(user('STUDENT'))).toThrow(ForbiddenException);
  expect(
    Reflect.getMetadata(REQUIRED_ROLES_KEY, AiInsightsController),
  ).not.toContain('STUDENT');
});
it('intersects client filters with authorization and scopes every dependent query', async () => {
  const { db, context } = setup();
  await context.snapshot(user('CAMPUS_MANAGER'), {
    campusId: 'foreign-campus',
    offeringId: 'foreign-subject',
  });
  const query = db.subjectOffering.findMany.mock.calls[0][0];
  expect(query.where.AND[0]).toEqual(insightScope(user('CAMPUS_MANAGER')));
  expect(query.where.AND[1].batch.semester.campusId).toBe('foreign-campus');
  expect(
    db.scheduledSession.findMany.mock.calls[0][0].where.offeringId.in,
  ).toEqual(['offering-a']);
  expect(
    db.lectureReview.findMany.mock.calls[0][0].where.session.offeringId.in,
  ).toEqual(['offering-a']);
  expect(
    db.lectureReview.findMany.mock.calls[0][0].select.student,
  ).toBeUndefined();
});
it('calculates overdue work, weighted coverage, missing logs and feedback without guessing', async () => {
  const { context } = setup();
  const result = await context.snapshot(user('ADMIN'));
  expect(result.subjects[0]!.completion).toBe(25);
  expect(result.subjects[0]!.overdueTopics).toBe(1);
  expect(result.subjects[0]!.nextTopics).toEqual(['Arrays', 'Lists']);
  expect(result.summary).toMatchObject({
    missingLogs: 1,
    needsHelp: 3,
    reviews: 5,
    attention: 1,
  });
  expect(JSON.stringify(result)).not.toContain('private@example.test');
});
it('handles missing lesson plans without breaking the dashboard', async () => {
  const { context } = setup(false);
  const result = await context.snapshot(user('ADMIN'));
  expect(result.subjects[0]!.completion).toBeNull();
  expect(result.subjects[0]!.issues).toContain('Add a lesson plan.');
});
it('counts saved logs separately from ended unlogged and upcoming timetable classes', async () => {
  const { db, context } = setup();
  db.scheduledSession.count.mockImplementation(async ({ where }) =>
    where.logs ? 3 : where.startsAt ? 26 : 44,
  );
  const result = await context.snapshot(user('ADMIN'), { campusId: 'campus-a' });
  expect(result.coverage).toMatchObject({
    loggedLectures: 3,
    pastLectures: 44,
    upcomingLectures: 26,
  });
  expect(db.scheduledSession.count).toHaveBeenCalledWith({
    where: { offeringId: { in: ['offering-a'] }, logs: { some: {} } },
  });
  expect(db.scheduledSession.groupBy).toHaveBeenCalledWith({
    by: ['offeringId'],
    where: {
      offeringId: { in: ['offering-a'] },
      endsAt: { lte: expect.any(Date) },
      status: { in: ['SCHEDULED', 'COMPLETED', 'IN_PROGRESS'] },
      logs: { none: {} },
    },
    _count: { _all: true },
  });
});
it('does not flag a completed topic as overdue or still to teach when its stored percentage is stale', async () => {
  const { db, context } = setup();
  const [offering] = await db.subjectOffering.findMany();
  offering.lessonPlans[0]!.units[0]!.topics[0]!.status = 'COMPLETED';
  offering.lessonPlans[0]!.units[0]!.topics[0]!.currentCompletionPercentage = 0;
  const result = await context.snapshot(user('ADMIN'));
  expect(result.subjects[0]).toMatchObject({
    completion: 50, overdueTopics: 0, nextTopics: ['Lists'],
  });
});
it('generates a real data report without provider credentials or Redis', async () => {
  const { context } = setup();
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setWithExpiry: jest.fn().mockResolvedValue(undefined),
    incrementWithExpiry: jest.fn(),
  };
  const svc = makeInsights(context, redis as unknown as RedisService);
  const report = await svc.generate(user('ADMIN'), {});
  expect(report.mode).toBe('data');
  expect(report.text).toContain('Arrays');
  expect(report.text).toContain('3 understanding-gap responses');
  expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
});
it('rejects unconfigured AI clearly instead of labelling data rules as AI', async () => {
  const { context } = setup();
  const svc = makeInsights(context, {} as RedisService);
  await expect(
    svc.generate(user('ADMIN'), {}, 'What next?', true),
  ).rejects.toThrow('AI is not connected');
});
it('calls the configured provider with server context and no tools or storage', async () => {
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_MODEL = 'configured-model';
  process.env.OPENAI_API_KEY = 'test-only';
  const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: 'Focus on Arrays [DSA, Batch A].',
              },
            ],
          },
        ],
      }),
    ),
  );
  const { context } = setup();
  const svc = makeInsights(context, {
    get: jest.fn().mockResolvedValue(null),
    setWithExpiry: jest.fn().mockResolvedValue(undefined),
    incrementWithExpiry: jest.fn().mockResolvedValue(1),
  } as unknown as RedisService);
  const report = await svc.generate(user('FACULTY'), {}, 'What next?', true);
  expect(report.mode).toBe('ai');
  const sent = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(sent.store).toBe(false);
  expect(sent.tools).toBeUndefined();
  expect(sent.instructions).toContain('untrusted data');
  expect(sent.input).toContain('Arrays');
  expect(sent.input).toContain('Semester setup');
  expect(sent.input).toContain('workflows');
  expect(sent.input).toContain('Test');
  expect(sent.input).not.toContain('private@example.test');
});
it('protects provider failures and limits without leaking raw responses', async () => {
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_MODEL = 'configured-model';
  process.env.OPENAI_API_KEY = 'test-only';
  const { context } = setup();
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setWithExpiry: jest.fn().mockResolvedValue(undefined),
    incrementWithExpiry: jest.fn().mockResolvedValue(21),
  };
  const svc = makeInsights(context, redis as unknown as RedisService);
  const fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('secret diagnostic', { status: 401 }));
  await expect(
    svc.generate(user('FACULTY'), {}, 'What next?', true),
  ).rejects.toThrow('limit reached');
  expect(fetcher).not.toHaveBeenCalled();
  const other = setup();
  const failing = makeInsights(other.context, {
    get: jest.fn().mockResolvedValue(null),
    setWithExpiry: jest.fn().mockResolvedValue(undefined),
    incrementWithExpiry: jest.fn().mockResolvedValue(1),
  } as unknown as RedisService);
  await expect(
    failing.generate(user('FACULTY'), {}, 'What next?', true),
  ).rejects.toThrow('The AI provider rejected its credentials');
});

it('uses Ollama cloud with the efficient default and only returns the final answer', async () => {
  process.env.OLLAMA_API_KEY = 'test-ollama-key';
  const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        done: true,
        done_reason: 'stop',
        message: {
          content: 'Focus on Arrays.',
          thinking: 'private reasoning',
        },
      }),
    ),
  );
  const { context } = setup();
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setWithExpiry: jest.fn().mockResolvedValue(undefined),
    incrementWithExpiry: jest.fn().mockResolvedValue(1),
  };
  const svc = makeInsights(context, redis as unknown as RedisService);
  expect(svc.configuration()).toEqual({ ready: true, provider: 'ollama' });
  const report = await svc.generate(user('FACULTY'), {}, 'What next?', true);
  expect(fetcher.mock.calls[0]![0]).toBe('https://ollama.com/api/chat');
  const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(request).toMatchObject({
    model: 'gpt-oss:20b',
    stream: false,
    think: 'low',
    options: { num_predict: 4096, temperature: 0.2 },
  });
  expect(report.text).toBe('Focus on Arrays.');
  expect(JSON.stringify(report)).not.toContain('private reasoning');
  expect(redis.setWithExpiry).toHaveBeenCalledWith(
    expect.stringMatching(/^ai:report:v2:/),
    expect.any(String),
    300,
  );
});
it('reuses cached AI output only after collecting fresh authorized context', async () => {
  process.env.OLLAMA_API_KEY = 'test-only';
  const { context } = setup();
  const snapshot = jest.spyOn(context, 'snapshot');
  const fetcher = jest.spyOn(globalThis, 'fetch');
  const redis = {
    get: jest.fn().mockResolvedValue(
      JSON.stringify({
        text: 'Cached report',
        generatedAt: '2026-10-15T10:00:00Z',
      }),
    ),
    incrementWithExpiry: jest.fn(),
  };
  const svc = makeInsights(context, redis as unknown as RedisService);
  const report = await svc.generate(user('FACULTY'), {}, 'What next?', true);
  expect(report.text).toBe('Cached report');
  expect(snapshot).toHaveBeenCalledWith(user('FACULTY'), {});
  expect(fetcher).not.toHaveBeenCalled();
  expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
});

function makeInsights(context: AiContextService, redis: RedisService) {
  return new AiInsightsService(context, redis, {
    history: jest.fn().mockResolvedValue(null),
    append: jest.fn().mockResolvedValue('chat-id'),
  } as unknown as AiConversationService);
}

it('normalizes provider settings and explains rejected credentials', async () => {
  process.env.AI_PROVIDER = ' Ollama ';
  process.env.AI_MODEL = ' gpt-oss:20b ';
  process.env.OLLAMA_API_KEY = 'test-only';
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
  const { context } = setup();
  const svc = makeInsights(context, {
    get: jest.fn().mockResolvedValue(null),
    incrementWithExpiry: jest.fn().mockResolvedValue(1),
  } as unknown as RedisService);
  expect(svc.configuration()).toEqual({ ready: true, provider: 'ollama' });
  await expect(svc.generate(user('FACULTY'), {}, 'Help', true)).rejects.toThrow('rejected its credentials');
});

it('includes existing semester and catalog setup even with no subject offerings', async () => {
  const { db, context } = setup();
  db.subjectOffering.findMany.mockResolvedValueOnce([]);
  const snapshot = await context.snapshot(user('ADMIN'), { campusId: 'campus-a' });
  expect(snapshot.subjects).toEqual([]);
  expect(snapshot.viewer).toEqual({ name: 'Test', roles: ['ADMIN'] });
  expect(snapshot.setup.semesters[0]?.name).toBe('Semester 1');
  expect(snapshot.setup.catalog[0]?.name).toBe('Web Development');
  expect(db.subjectOffering.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ status: { in: ['DRAFT', 'ACTIVE', 'COMPLETE'] } })]) }) }));
});

it('keeps setup context campus-scoped and does not expose the catalog to faculty', async () => {
  const { db, context } = setup();
  await context.snapshot(user('FACULTY'), { campusId: 'campus-b' });
  expect(db.subject.findMany).not.toHaveBeenCalled();
  expect(db.semester.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { campus: { AND: [{ id: { in: ['campus-a'] } }, { id: 'campus-b' }] } },
  }));
});

it('preserves complete recent replies for follow-up context', async () => {
  const { conversationContext } = await import('./ai-insights.service');
  const long = 'x'.repeat(8000) + ' final important detail';
  expect(conversationContext([{ role: 'assistant', content: long }])[0]!.content).toBe(long);
  const history = conversationContext([{ role: 'user', content: 'old'.repeat(20000) }, { role: 'assistant', content: long }]);
  expect(history).toHaveLength(1);
  expect(history[0]!.content).toBe(long);
});
it('supplies weighted hours and actual missing-log totals to the model', async () => {
  const { compactContext } = await import('./ai-insights.service');
  const { context } = setup();
  const snapshot = await context.snapshot(user('ADMIN'), {});
  const compact = compactContext(snapshot);
  expect(compact.subjects[0]).toMatchObject({ plannedMinutes: 200, coveredMinutes: 50, remainingMinutes: 150 });
  expect(compact.subjects[0]!.missingLogs).toBe(snapshot.subjects[0]!.missingLogs);
  expect(JSON.stringify(compact)).not.toContain('overdueTopicIds');
  expect(JSON.stringify(compact)).not.toContain('campus-a');
});
it('marks provider-truncated replies as incomplete and never caches them as finished', async () => {
  process.env.OLLAMA_API_KEY = 'test';
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ done: true, done_reason: 'length', message: { content: 'An unfinished answer' } })));
  const { context } = setup();
  const redis = { get: jest.fn().mockResolvedValue(null), incrementWithExpiry: jest.fn().mockResolvedValue(1), setWithExpiry: jest.fn() };
  const result = await makeInsights(context, redis as unknown as RedisService).generate(user('ADMIN'), {}, 'Explain', true);
  expect(result).toMatchObject({ incomplete: true, text: 'An unfinished answer' });
  expect(redis.setWithExpiry).not.toHaveBeenCalled();
});

it('uses dashboard calculations and excludes skipped work from AI monitoring', async () => {
  const {db, context} = setup();
  const rows = await db.subjectOffering.findMany();
  const offering = rows[0] as any;
  offering.targetFinishDate = new Date('2099-12-31');
  offering.sessions = [];
  offering.timetableEntries = [];
  offering.lessonPlans[0].units[0].topics.push({id:'skipped',title:'Excluded',plannedMinutes:900,status:'SKIPPED',currentCompletionPercentage:0,examScopes:[]});
  db.subjectOffering.findMany.mockResolvedValue([offering]);
  const result = await context.snapshot(user('ADMIN'));
  expect(result.subjects[0]?.plannedMinutes).toBe(200);
  expect(result.subjects[0]?.coveredMinutes).toBe(50);
  expect(result.subjects[0]?.monitoring?.status).toBe('NEEDS_DATA');
  expect(result.subjects[0]?.monitoring?.remainingHours).toBe(2.5);
  expect(result.subjects[0]?.issues).toContain('Create the weekly timetable.');
});
