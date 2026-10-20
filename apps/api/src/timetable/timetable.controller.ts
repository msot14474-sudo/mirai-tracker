import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedImportFile } from '../semester-import/semester-import.types';
import { timetableCsvTemplate } from './timetable-import.parser';
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
  UploadedFile,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { z } from 'zod';
import {
  isoDateSchema,
  uuidSchema,
} from '../academic-calendar/academic-calendar.schemas';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  createTimetableEntrySchema,
  extraClassSchema,
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

  @Get('batch-template')
  @Roles(UserRole.CAMPUS_MANAGER)
  template() {
    return new StreamableFile(Buffer.from(timetableCsvTemplate), {
      type: 'text/csv',
      disposition: 'attachment; filename="weekly-batch-timetable.csv"',
    });
  }

  @Post('batches/:batchId/preview')
  @Roles(UserRole.CAMPUS_MANAGER)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  previewBatch(
    @Param('batchId') batchId: string,
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a timetable file.');
    return this.timetable.importBatch(id(batchId), file, user);
  }

  @Post('batches/:batchId/import')
  @Roles(UserRole.CAMPUS_MANAGER)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  importBatch(
    @Param('batchId') batchId: string,
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a timetable file.');
    return this.timetable.importBatch(id(batchId), file, user, true);
  }

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
  @Roles(UserRole.CAMPUS_MANAGER)
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

  @Post('offerings/:offeringId/extra-classes')
  @Roles(UserRole.CAMPUS_MANAGER)
  extraClass(
    @Param('offeringId') offeringId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetable.createExtraClass(
      id(offeringId),
      parse(extraClassSchema, body),
      user,
    );
  }

  @Patch('entries/:entryId')
  @Roles(UserRole.CAMPUS_MANAGER)
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

  @Post('sessions/:sessionId/move')
  @Roles(UserRole.CAMPUS_MANAGER)
  moveSession(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timetable.moveSession(
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

  @Delete('entries/:entryId')
  @Roles(UserRole.CAMPUS_MANAGER)
  @HttpCode(204)
  async archive(
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.timetable.archiveEntry(id(entryId), user);
  }

  @Post('offerings/:offeringId/generate')
  @Roles(UserRole.CAMPUS_MANAGER)
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
