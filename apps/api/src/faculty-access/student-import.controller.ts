import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { UploadedImportFile } from '../semester-import/semester-import.types';
import { uuidSchema } from '../academic-calendar/academic-calendar.schemas';
import { StudentImportService } from './student-import.service';
const id = (s: string) => {
  const v = uuidSchema.safeParse(s);
  if (!v.success)
    throw new BadRequestException('Choose a valid campus and batch.');
  return v.data;
};
@Controller('faculty-access/campuses/:campusId/students')
@Roles('ADMIN', 'CAMPUS_MANAGER')
export class StudentImportController {
  constructor(private readonly service: StudentImportService) {}
  @Get('template')
  async template(
    @Param('campusId') campusId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return new StreamableFile(await this.service.template(id(campusId), user), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="student-access-template.xlsx"',
    });
  }
  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @Param('campusId') campusId: string,
    @Body('batchId') batchId: string,
    @UploadedFile() file: UploadedImportFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.inspect(id(campusId), id(batchId), file, user);
  }
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  execute(
    @Param('campusId') campusId: string,
    @Body('batchId') batchId: string,
    @Body('fingerprint') fingerprint: string,
    @UploadedFile() file: UploadedImportFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.inspect(
      id(campusId),
      id(batchId),
      file,
      user,
      true,
      fingerprint,
    );
  }
}
