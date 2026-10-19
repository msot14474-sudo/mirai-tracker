import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  createTimetableEntrySchema,
  updateTimetableEntrySchema,
} from './timetable.schemas';
import { TimetableService } from './timetable.service';

const managers = [
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
  UserRole.CAMPUS_MANAGER,
] as const;

@Controller('timetable')
@Roles(...managers)
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get('semesters/:semesterId/offerings')
  offerings(
    @Param('semesterId') semesterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetable.listSemesterOfferings(id(semesterId), user);
  }

  @Get('offerings/:offeringId')
  offering(
    @Param('offeringId') offeringId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetable.offering(id(offeringId), user);
  }

  @Post('offerings/:offeringId/entries')
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  create(
    @Param('offeringId') offeringId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetable.createEntry(
      id(offeringId),
      parse(createTimetableEntrySchema, body),
      user,
    );
  }

  @Patch('entries/:entryId')
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  update(
    @Param('entryId') entryId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetable.updateEntry(
      id(entryId),
      parse(updateTimetableEntrySchema, body),
      user,
    );
  }

  @Delete('entries/:entryId')
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  @HttpCode(204)
  async archive(
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.timetable.archiveEntry(id(entryId), user);
  }

  @Post('offerings/:offeringId/generate')
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  generate(
    @Param('offeringId') offeringId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetable.generate(id(offeringId), user);
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
