import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  examScopeSchema,
  updateTopicSchema,
  updateUnitSchema,
} from './lesson-plan.schemas';
import { LessonPlanService } from './lesson-plan.service';
import {
  buildLessonPlanCsv,
  buildLessonPlanWorkbook,
} from './lesson-plan.template';
import { UploadedImportFile } from './lesson-plan.types';

const editors = [
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
  UserRole.CAMPUS_MANAGER,
  UserRole.FACULTY,
] as const;
const upload = FileInterceptor('file', {
  limits: { files: 1 },
});

@Controller('lesson-plans')
@Roles(...editors)
export class LessonPlanController {
  constructor(private readonly plans: LessonPlanService) {}

  @Get('template')
  async template(@Query('format') format = 'xlsx') {
    if (format === 'csv') {
      const content = Buffer.from(buildLessonPlanCsv(), 'utf8');
      return new StreamableFile(content, {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="mirai-lesson-plan.csv"',
        length: content.length,
      });
    }
    if (format !== 'xlsx') {
      throw new BadRequestException('Template format must be csv or xlsx.');
    }
    const content = await buildLessonPlanWorkbook();
    return new StreamableFile(content, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="mirai-lesson-plan.xlsx"',
      length: content.length,
    });
  }

  @Get('offerings')
  offerings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('campusId') campusId?: string,
  ) {
    return this.plans.listOfferings(user, campusId ? id(campusId) : undefined);
  }

  @Get('offerings/:offeringId')
  offering(
    @Param('offeringId') offeringId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.offering(id(offeringId), user);
  }

  @Post('offerings/:offeringId/preview')
  @Roles(UserRole.ADMIN, UserRole.FACULTY)
  @UseInterceptors(upload)
  preview(
    @Param('offeringId') offeringId: string,
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.preview(id(offeringId), requiredFile(file), user);
  }

  @Post('offerings/:offeringId/import')
  @Roles(UserRole.ADMIN, UserRole.FACULTY)
  @UseInterceptors(upload)
  execute(
    @Param('offeringId') offeringId: string,
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.import(id(offeringId), requiredFile(file), user);
  }

  @Patch('units/:unitId')
  @Roles(UserRole.ADMIN, UserRole.FACULTY)
  updateUnit(
    @Param('unitId') unitId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.updateUnit(
      id(unitId),
      parse(updateUnitSchema, body),
      user,
    );
  }

  @Patch('topics/:topicId')
  @Roles(UserRole.ADMIN, UserRole.FACULTY)
  updateTopic(
    @Param('topicId') topicId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.updateTopic(
      id(topicId),
      parse(updateTopicSchema, body),
      user,
    );
  }

  @Put('plans/:planId/exam-scopes/:examWindowId')
  @Roles(UserRole.ADMIN, UserRole.FACULTY)
  setScope(
    @Param('planId') planId: string,
    @Param('examWindowId') examWindowId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.setExamScope(
      id(planId),
      id(examWindowId),
      parse(examScopeSchema, body),
      user,
    );
  }

  @Post('plans/:planId/activate')
  @Roles(UserRole.ADMIN, UserRole.FACULTY)
  activate(
    @Param('planId') planId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.activate(id(planId), user);
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

function requiredFile(file: UploadedImportFile | undefined) {
  if (!file) throw new BadRequestException('Choose a CSV or Excel file.');
  return file;
}
