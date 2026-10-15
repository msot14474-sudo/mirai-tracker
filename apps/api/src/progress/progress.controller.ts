import { UserRole } from '@prisma/client';
import {
  BadRequestException,
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
import { ProgressService } from './progress.service';
import { progressDateQuerySchema } from './progress.schemas';

const viewers = [
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
  UserRole.CAMPUS_MANAGER,
  UserRole.FACULTY,
  UserRole.STUDENT,
] as const;

@Controller('progress')
@Roles(...viewers)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('exam-readiness')
  @Roles(
    UserRole.ADMIN,
    UserRole.PROGRAM_MANAGER,
    UserRole.CAMPUS_MANAGER,
    UserRole.FACULTY,
  )
  examReadiness(
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { asOf, campusId } = parse(progressDateQuerySchema, query);
    return this.progress.examReadiness(asOf, user, campusId);
  }

  @Get('dashboard')
  @Roles(
    UserRole.ADMIN,
    UserRole.PROGRAM_MANAGER,
    UserRole.CAMPUS_MANAGER,
    UserRole.FACULTY,
  )
  dashboard(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { asOf, campusId } = parse(progressDateQuerySchema, query);
    return this.progress.dashboard(asOf, user, campusId);
  }

  @Get('subjects')
  subjects(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { asOf, campusId } = parse(progressDateQuerySchema, query);
    return this.progress.list(asOf, user, campusId);
  }

  @Get('subjects/:offeringId')
  subject(
    @Param('offeringId') offeringId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { asOf, campusId } = parse(progressDateQuerySchema, query);
    return this.progress.subject(id(offeringId), asOf, user);
  }

  @Post('subjects/:offeringId/snapshots')
  @Roles(
    UserRole.ADMIN,
    UserRole.PROGRAM_MANAGER,
    UserRole.CAMPUS_MANAGER,
    UserRole.FACULTY,
  )
  snapshot(
    @Param('offeringId') offeringId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { asOf, campusId } = parse(progressDateQuerySchema, query);
    return this.progress.snapshot(id(offeringId), asOf, user);
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
