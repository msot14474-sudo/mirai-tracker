import { PrismaClient } from '@prisma/client';
import { AiConversationService } from '../src/ai-insights/ai-conversation.service';
import {
  AiContextService,
  InsightSnapshot,
} from '../src/ai-insights/ai-context.service';
import { PrismaService } from '../src/database/prisma.service';
import { AuthenticatedUser } from '../src/auth/auth.types';
const prisma = new PrismaClient();
let user: AuthenticatedUser;
const snapshot = {
  subjects: [{ id: 'offering-a' }],
} as unknown as InsightSnapshot;
const context = { snapshot: jest.fn().mockResolvedValue(snapshot) };
const chats = new AiConversationService(
  prisma as PrismaService,
  context as unknown as AiContextService,
);
beforeAll(async () => {
  const row = await prisma.user.create({
    data: {
      name: 'AI conversation test',
      email: `ai-test-${Date.now()}@mirai.local`,
      status: 'ACTIVE',
    },
  });
  user = {
    id: row.id,
    name: row.name,
    email: row.email,
    roles: [{ role: 'ADMIN', campusId: null }],
    staffProfileId: null,
    studentProfile: null,
  };
});
afterAll(async () => {
  if (user) await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});
it('persists exchanges and reopens them in chronological order', async () => {
  const id = await chats.append(
    user,
    {},
    snapshot,
    null,
    'Which topic?',
    'Arrays.',
  );
  const history = await chats.history(user, {}, snapshot, id);
  await chats.append(
    user,
    {},
    snapshot,
    history,
    'How do I teach it?',
    'Use an example.',
  );
  const result = await chats.read(user, {}, id);
  expect(result.messages.map((m) => m.content)).toEqual([
    'Which topic?',
    'Arrays.',
    'How do I teach it?',
    'Use an example.',
  ]);
  expect((await chats.list(user, {})).some((c) => c.id === id)).toBe(true);
});
it('blocks another owner, a changed scope and revoked subject access', async () => {
  const id = await chats.append(user, {}, snapshot, null, 'Question', 'Answer');
  await expect(
    chats.history(
      { ...user, id: '00000000-0000-4000-8000-000000000001' },
      {},
      snapshot,
      id,
    ),
  ).rejects.toThrow('unavailable');
  await expect(
    chats.history(user, { campusId: 'different' }, snapshot, id),
  ).rejects.toThrow('unavailable');
  await expect(
    chats.history(user, {}, { subjects: [] } as unknown as InsightSnapshot, id),
  ).rejects.toThrow('unavailable');
});
it('rejects a stale concurrent continuation without partial messages', async () => {
  const id = await chats.append(
    user,
    {},
    snapshot,
    null,
    'First',
    'First answer',
  );
  const history = await chats.history(user, {}, snapshot, id);
  await chats.append(user, {}, snapshot, history, 'Second', 'Second answer');
  await expect(
    chats.append(user, {}, snapshot, history, 'Stale', 'Stale answer'),
  ).rejects.toThrow('another message');
  expect((await chats.read(user, {}, id)).messages).toHaveLength(4);
});
it('bounds model context to six exchanges while retaining full saved history', async () => {
  let id = await chats.append(user, {}, snapshot, null, 'Start', 'Answer');
  for (let i = 0; i < 7; i++) {
    const history = await chats.history(user, {}, snapshot, id);
    id = await chats.append(
      user,
      {},
      snapshot,
      history,
      `Question ${i}`,
      `Answer ${i}`,
    );
  }
  expect((await chats.history(user, {}, snapshot, id))?.messages).toHaveLength(
    12,
  );
  expect((await chats.read(user, {}, id)).messages).toHaveLength(16);
});
