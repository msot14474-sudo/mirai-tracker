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
  constructor(private readonly insights: AiInsightsService) {}
  @Get()
  overview(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.insights.overview(user, parse(filter, query));
  }
  @Post('report')
  report(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { question, useAi, ...scope } = parse(request, body);
    return this.insights.generate(user, scope, question, useAi);
  }
}
