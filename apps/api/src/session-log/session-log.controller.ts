import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  createSessionLogSchema,
  sessionLogDateQuerySchema,
} from './session-log.schemas';
import { SessionLogService } from './session-log.service';

@Controller('session-logs')
@Roles(UserRole.FACULTY)
export class SessionLogController {
  constructor(private readonly logs: SessionLogService) {}

  @Get('sessions')
  sessions(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { date, campusId } = parse(sessionLogDateQuerySchema, query);
    return this.logs.listForDate(date, user, campusId);
  }

  @Post('sessions/:sessionId/logs')
  create(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.logs.create(
      parse(uuidSchema, sessionId),
      parse(createSessionLogSchema, body),
      user,
    );
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Request validation failed.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
