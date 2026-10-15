import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  AiContextService,
  InsightFilter,
  InsightSnapshot,
} from './ai-context.service';
export function conversationScope(
  user: AuthenticatedUser,
  filter: InsightFilter,
  snapshot: InsightSnapshot,
) {
  return {
    userId: user.id,
    scopeKey: JSON.stringify([
      filter.campusId ?? null,
      filter.offeringId ?? null,
    ]),
    accessKey: createHash('sha256')
      .update(
        JSON.stringify({
          roles: user.roles.map((r) => `${r.role}:${r.campusId}`).sort(),
          staff: user.staffProfileId,
          subjects: snapshot.subjects.map((s) => s.id).sort(),
        }),
      )
      .digest('hex'),
  };
}
@Injectable()
export class AiConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AiContextService,
  ) {}
  async list(user: AuthenticatedUser, filter: InsightFilter) {
    const snapshot = await this.context.snapshot(user, filter);
    return this.prisma.aiConversation.findMany({
      where: conversationScope(user, filter, snapshot),
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, updatedAt: true },
    });
  }
  async read(user: AuthenticatedUser, filter: InsightFilter, id: string) {
    const snapshot = await this.context.snapshot(user, filter);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, ...conversationScope(user, filter, snapshot) },
      include: { messages: { orderBy: { ordinal: 'desc' }, take: 100 } },
    });
    if (!conversation)
      throw new NotFoundException(
        'This conversation is unavailable in your current access scope. Start a new chat.',
      );
    return {
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages.reverse(),
      earlierMessages: Math.max(
        0,
        conversation.version * 2 - conversation.messages.length,
      ),
    };
  }
  async history(
    user: AuthenticatedUser,
    filter: InsightFilter,
    snapshot: InsightSnapshot,
    id?: string,
  ) {
    if (!id) return null;
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, ...conversationScope(user, filter, snapshot) },
      include: { messages: { orderBy: { ordinal: 'desc' }, take: 12 } },
    });
    if (!conversation)
      throw new NotFoundException(
        'This conversation is unavailable in your current access scope. Start a new chat.',
      );
    return { ...conversation, messages: conversation.messages.reverse() };
  }
  async append(
    user: AuthenticatedUser,
    filter: InsightFilter,
    snapshot: InsightSnapshot,
    history: Awaited<ReturnType<AiConversationService['history']>>,
    question: string,
    answer: string,
  ) {
    const scope = conversationScope(user, filter, snapshot);
    return this.prisma.$transaction(async (tx) => {
      const conversation =
        history ??
        (await tx.aiConversation.create({
          data: { ...scope, title: question.slice(0, 160) },
        }));
      const updated = await tx.aiConversation.updateMany({
        where: { id: conversation.id, version: conversation.version, ...scope },
        data: { version: { increment: 1 }, updatedAt: new Date() },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'This chat received another message. Reopen it before sending again.',
        );
      await tx.aiMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            ordinal: conversation.version * 2 + 1,
            role: 'user',
            content: question,
          },
          {
            conversationId: conversation.id,
            ordinal: conversation.version * 2 + 2,
            role: 'assistant',
            content: answer,
          },
        ],
      });
      return conversation.id;
    });
  }
}
