import { UserRole } from '@prisma/client';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { auditHistoryQuerySchema } from './audit.schemas';
import { AuditService } from './audit.service';

@Controller('audit-events')
@Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  history(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = auditHistoryQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    }
    return this.audit.history(parsed.data, user);
  }
}
