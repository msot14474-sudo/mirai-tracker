import { recommendRecovery } from './recovery-recommendation';
const options = [
  {
    id: '2030-01-07',
    date: '2030-01-07',
    startTime: '09:00',
    endTime: '10:00',
    afterTarget: false,
  },
];
const originalKey = process.env.OLLAMA_API_KEY;
afterEach(() => {
  jest.restoreAllMocks();
  if (originalKey === undefined) delete process.env.OLLAMA_API_KEY;
  else process.env.OLLAMA_API_KEY = originalKey;
});
it('keeps useful calendar choices when AI is unavailable', async () => {
  delete process.env.OLLAMA_API_KEY;
  expect(await recommendRecovery(options, {})).toMatchObject({
    recommendedId: '2030-01-07',
    source: 'calendar',
  });
  expect(await recommendRecovery([], {})).toMatchObject({
    recommendedId: null,
    source: 'calendar',
  });
});
it.each([
  {
    done: true,
    message: {
      content: JSON.stringify({
        recommendedId: 'unapproved-date',
        explanation: 'Try this',
      }),
    },
  },
  { done: true, done_reason: 'length', message: { content: '{}' } },
  { done: false, message: { content: '{}' } },
])('never trusts an invented or incomplete AI schedule', async (body) => {
  process.env.OLLAMA_API_KEY = 'test';
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body)));
  expect(await recommendRecovery(options, {})).toMatchObject({
    recommendedId: '2030-01-07',
    source: 'calendar',
  });
});
it('allows AI to rank only checked choices without changing their times', async () => {
  process.env.OLLAMA_API_KEY = 'test';
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          done: true,
          message: {
            content: JSON.stringify({
              recommendedId: '2030-01-07',
              explanation: 'Keeps the unfinished topic before the exam.',
            }),
          },
        }),
      ),
    );
  expect(await recommendRecovery(options, { topic: 'Arrays' })).toMatchObject({
    recommendedId: '2030-01-07',
    source: 'ai',
  });
  expect(options[0]?.startTime).toBe('09:00');
});
