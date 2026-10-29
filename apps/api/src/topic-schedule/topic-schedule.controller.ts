import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Query,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  isoDateSchema,
  uuidSchema,
} from '../academic-calendar/academic-calendar.schemas';
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

  @Get('workspace')
  workspace(
    @CurrentUser() user: AuthenticatedUser,
    @Query('campusId') campusId?: string,
  ) {
    return this.schedules.workspace(
      user,
      campusId ? id(campusId) : undefined,
    );
  }

  @Get('offerings')
  offerings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('campusId') campusId?: string,
  ) {
    return this.schedules.listOfferings(
      user,
      campusId ? id(campusId) : undefined,
    );
  }

  @Get('offerings/:offeringId')
  offering(
    @Param('offeringId') offeringId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedules.offering(id(offeringId), user);
  }

  @Post('offerings/:offeringId/calculate')
  @Roles(UserRole.FACULTY)
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

  @Post('sessions/:sessionId/recovery-options')
  @Roles(UserRole.FACULTY)
  recoveryOptions(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedules.recoveryOptions(id(sessionId), user);
  }

  @Post('sessions/:sessionId/move')
  @Roles(UserRole.FACULTY)
  move(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.schedules.moveSession(
      id(sessionId),
      parse(
        z.object({
          date: isoDateSchema,
          startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
          endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
          reason: z.string().trim().min(1).max(1000),
        }),
        body,
      ),
      user,
    );
  }

  @Patch('sessions/:sessionId')
  @Roles(UserRole.FACULTY)
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
