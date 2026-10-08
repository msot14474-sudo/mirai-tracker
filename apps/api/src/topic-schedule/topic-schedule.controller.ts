import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  calculateTopicScheduleSchema,
  setSessionCancellationSchema,
} from './topic-schedule.schemas';
import { TopicScheduleService } from './topic-schedule.service';

const editors = [
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
  UserRole.CAMPUS_MANAGER,
  UserRole.FACULTY,
] as const;

@Controller('topic-schedules')
@Roles(...editors)
export class TopicScheduleController {
  constructor(private readonly schedules: TopicScheduleService) {}

  @Get('offerings')
  offerings(@CurrentUser() user: AuthenticatedUser) {
    return this.schedules.listOfferings(user);
  }

  @Get('offerings/:offeringId')
  offering(
    @Param('offeringId') offeringId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedules.offering(id(offeringId), user);
  }

  @Post('offerings/:offeringId/calculate')
  calculate(
    @Param('offeringId') offeringId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedules.calculate(
      id(offeringId),
      parse(calculateTopicScheduleSchema, body ?? {}),
      user,
    );
  }

  @Patch('sessions/:sessionId')
  setCancellation(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedules.setSessionCancellation(
      id(sessionId),
      parse(setSessionCancellationSchema, body),
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

function id(value: string) {
  return parse(uuidSchema, value);
}
