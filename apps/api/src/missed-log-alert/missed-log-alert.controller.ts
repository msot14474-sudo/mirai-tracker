import { AlertType, UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { MissedLogAlertService } from './missed-log-alert.service';

const processAlertSchema = z.object({ stage: z.nativeEnum(AlertType) });

@Controller('missed-log-alerts')
export class MissedLogAlertController {
  constructor(private readonly alerts: MissedLogAlertService) {}

  @Get('me')
  @Roles(UserRole.FACULTY, UserRole.CAMPUS_MANAGER)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.listMine(user);
  }

  @Post('process-due')
  @Public()
  processDue(
    @Headers('x-internal-job-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.alerts.assertInternalSecret(secret);
    const parsed = processAlertSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Choose a valid missed-log alert stage.');
    }
    return this.alerts.processDue(parsed.data.stage);
  }
}
