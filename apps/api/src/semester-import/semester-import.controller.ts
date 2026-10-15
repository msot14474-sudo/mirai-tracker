import { UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import { SemesterImportService } from './semester-import.service';
import {
  buildSemesterImportCsv,
  buildSemesterImportWorkbook,
} from './semester-import.template';
import { UploadedImportFile } from './semester-import.types';

import {
  ProgressImportService,
  mappingSchema,
} from './progress-import.service';

const managers = [UserRole.ADMIN, UserRole.PROGRAM_MANAGER] as const;
const upload = FileInterceptor('file', {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

@Controller('imports')
@Roles(...managers)
export class SemesterImportController {
  constructor(
    private readonly imports: SemesterImportService,
    private readonly progress: ProgressImportService,
  ) {}

  @Post('progress/inspect')
  @UseInterceptors(upload)
  inspectProgress(
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body('useAi') useAi: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progress.inspect(requiredFile(file), useAi === 'true', user);
  }

  @Post('progress/preview')
  @UseInterceptors(upload)
  previewProgress(
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body('offeringId') offeringId: string,
    @Body('mapping') mapping: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progress.preview(
      requiredFile(file),
      parseId(offeringId),
      parseMapping(mapping),
      user,
    );
  }

  @Post('progress')
  @UseInterceptors(upload)
  importProgress(
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body('offeringId') offeringId: string,
    @Body('mapping') mapping: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progress.execute(
      requiredFile(file),
      parseId(offeringId),
      parseMapping(mapping),
      user,
    );
  }

  @Get('template')
  async template(@Query('format') format = 'xlsx') {
    if (format === 'csv') {
      const content = Buffer.from(buildSemesterImportCsv(), 'utf8');
      return new StreamableFile(content, {
        type: 'text/csv; charset=utf-8',
        disposition: 'attachment; filename="mirai-semester-import.csv"',
        length: content.length,
      });
    }
    if (format !== 'xlsx') {
      throw new BadRequestException('Template format must be csv or xlsx.');
    }
    const content = await buildSemesterImportWorkbook();
    return new StreamableFile(content, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="mirai-semester-import.xlsx"',
      length: content.length,
    });
  }

  @Post('preview')
  @UseInterceptors(upload)
  preview(
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.preview(requiredFile(file), user);
  }

  @Post()
  @UseInterceptors(upload)
  execute(
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.execute(requiredFile(file), user);
  }

  @Get()
  jobs(@CurrentUser() user: AuthenticatedUser) {
    return this.imports.listJobs(user);
  }

  @Get(':jobId/errors.csv')
  async errors(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const id = parseId(jobId);
    const content = await this.imports.errorReport(id, user);
    return new StreamableFile(content, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="import-${id}-errors.csv"`,
      length: content.length,
    });
  }

  @Get(':jobId')
  job(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.imports.job(parseId(jobId), user);
  }
}

function requiredFile(file: UploadedImportFile | undefined) {
  if (!file) throw new BadRequestException('Choose a CSV or Excel file.');
  return file;
}

function parseId(value: string) {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new BadRequestException('Invalid import job id.');
  return result.data;
}

function parseMapping(value: string) {
  try {
    return mappingSchema.parse(JSON.parse(value));
  } catch {
    throw new BadRequestException(
      'Check the selected worksheet and column mapping.',
    );
  }
}
