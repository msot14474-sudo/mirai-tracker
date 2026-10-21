import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { ReportDocumentService } from './report-document.service';
import { ReportsService } from './reports.service';
import { reportQuerySchema } from './reports.schemas';

@Controller('reports')
@Roles(
  UserRole.ADMIN,
  UserRole.PROGRAM_MANAGER,
  UserRole.CAMPUS_MANAGER,
  UserRole.FACULTY,
)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly documents: ReportDocumentService,
  ) {}
  @Get()
  read(@Query() raw: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.read(user, parse(raw));
  }
  @Get('summary')
  summary(@Query() raw: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.read(user, parse(raw), true);
  }
  @Post('document')
  async document(
    @Query() raw: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.documents.generate(user, parse(raw));
    return new StreamableFile(result.content, {
      type: 'text/html; charset=utf-8',
      disposition: `attachment; filename="${result.filename}"`,
    });
  }
  @Get('csv')
  async csv(@Query() raw: unknown, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.reports.csv(user, parse(raw));
    return new StreamableFile(result.content, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${result.filename}"`,
    });
  }
}
function parse(raw: unknown) {
  const parsed = reportQuerySchema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(parsed.error.issues.map((i) => i.message));
  return parsed.data;
}
