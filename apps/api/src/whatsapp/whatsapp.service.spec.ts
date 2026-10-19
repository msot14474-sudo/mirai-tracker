import { WhatsAppService } from './whatsapp.service';
import { validSignature } from './whatsapp.parser';
import { createHmac } from 'node:crypto';
const sid = '11111111-1111-4111-8111-111111111111';
function setup() {
  const db = {
    whatsAppLink: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'teacher' }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'teacher',
          name: 'Teacher',
          email: 't@example.com',
          status: 'ACTIVE',
          staffProfile: { id: 'staff', active: true },
          roleAssignments: [{ role: 'FACULTY' }],
        }),
    },
    sessionLog: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setWithExpiry: jest.fn(),
  };
  const logs = {
    listForDate: jest
      .fn()
      .mockResolvedValue({
        sessions: [
          {
            id: sid,
            startsAt: '2020-01-01T09:00:00Z',
            sessionDate: '2020-01-01',
            subject: { name: 'Web' },
            batch: { name: 'A' },
            topics: [],
          },
        ],
        mergeTargets: [],
      }),
    create: jest.fn().mockResolvedValue({ id: 'saved' }),
  };
  const service = new WhatsAppService(db as any, redis as any, logs as any);
  const ask = jest
    .spyOn(service as any, 'ask')
    .mockResolvedValueOnce({ date: '2020-01-01', question: '' });
  return { service, db, redis, logs, ask };
}
const log = {
  status: 'COMPLETED',
  overallCompletionPercentage: 100,
  coveredSummary: 'HTML forms',
  classworkStatus: 'COMPLETED',
  homeworkStatus: 'NOT_ASSIGNED',
  topicUpdates: [],
};
it('automatically saves a valid natural-language update using a stable request key', async () => {
  const x = setup();
  x.ask.mockResolvedValueOnce({
    action: 'log',
    reply: '',
    sessionId: sid,
    log,
  });
  // Nonempty conversational reply is required even though saved acknowledgement is generated server-side.
  x.ask
    .mockReset()
    .mockResolvedValueOnce({ date: '2020-01-01', question: '' })
    .mockResolvedValueOnce({
      action: 'log',
      reply: 'Understood.',
      sessionId: sid,
      log,
    });
  expect(
    await x.service.process(
      '919999999999',
      'Completed HTML forms today, all done, classwork finished, no homework.',
      'message-1',
    ),
  ).toContain('Saved for Web');
  expect(x.logs.create).toHaveBeenCalledWith(
    sid,
    log,
    expect.anything(),
    expect.stringMatching(/^whatsapp:[a-f0-9]{64}$/),
  );
  expect(x.redis.setWithExpiry).toHaveBeenCalledWith(
    'wa-state:teacher',
    expect.stringContaining('HTML forms'),
    86400,
  );
});
it.each(['discuss', 'clarify'])('does not save %s messages', async (action) => {
  const x = setup();
  x.ask.mockResolvedValueOnce({ action, reply: 'Which subject do you mean?' });
  expect(
    await x.service.process(
      '919999999999',
      'Can we move this to tomorrow?',
      'm',
    ),
  ).toContain('Which subject');
  expect(x.logs.create).not.toHaveBeenCalled();
});
it('rejects a fabricated session ID without saving', async () => {
  const x = setup();
  x.ask.mockResolvedValueOnce({
    action: 'log',
    reply: 'OK',
    sessionId: 'other',
    log,
  });
  expect(await x.service.process('919999999999', 'Log it', 'm')).toContain(
    'could not safely match',
  );
  expect(x.logs.create).not.toHaveBeenCalled();
});
it('does not duplicate a previously saved webhook', async () => {
  const x = setup();
  x.db.sessionLog.findUnique.mockResolvedValue({ id: 'saved' } as any);
  expect(await x.service.process('919999999999', 'Log it', 'm')).toContain(
    'already saved',
  );
  expect(x.ask).not.toHaveBeenCalled();
  expect(x.logs.create).not.toHaveBeenCalled();
});
it('rechecks revoked teacher access before reading classes', async () => {
  const x = setup();
  x.db.user.findUnique.mockResolvedValue(null as any);
  await expect(
    x.service.process('919999999999', 'Log it', 'm'),
  ).rejects.toThrow('no longer active');
  expect(x.logs.listForDate).not.toHaveBeenCalled();
});
it('validates webhook signature against exact raw body', () => {
  const raw = Buffer.from('{"message":"hello"}');
  const signature =
    'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
  expect(validSignature(raw, signature, 'secret')).toBe(true);
  expect(validSignature(Buffer.from('{}'), signature, 'secret')).toBe(false);
  expect(validSignature(raw, signature, undefined)).toBe(false);
});
