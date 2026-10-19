import { AiConversationService } from './ai-conversation.service';
import { Param, ParseUUIDPipe } from '@nestjs/common';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { AiInsightsService } from './ai-insights.service';
const filter = z
  .object({
    campusId: z.string().uuid().optional(),
    offeringId: z.string().uuid().optional(),
  })
  .strict();
const request = filter.extend({
  question: z.string().trim().min(1).max(2000).optional(),
  conversationId: z.string().uuid().optional(),
  useAi: z.boolean().default(false),
});
function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      'Select a valid scope and enter a question of up to 2,000 characters.',
    );
  return result.data;
}
@Controller('ai-insights')
@Roles(
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
  UserRole.CAMPUS_MANAGER,
  UserRole.FACULTY,
)
export class AiInsightsController {
  constructor(
    private readonly insights: AiInsightsService,
    private readonly chats: AiConversationService,
  ) {}
  @Get()
  overview(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.insights.overview(user, parse(filter, query));
  }
  @Get('conversations')
  conversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ) {
    return this.chats.list(user, parse(filter, query));
  }
  @Get('conversations/:id')
  conversation(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chats.read(user, parse(filter, query), id);
  }
  @Post('report')
  report(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { question, useAi, conversationId, ...scope } = parse(request, body);
    return this.insights.generate(user, scope, question, useAi, conversationId);
  }
}
