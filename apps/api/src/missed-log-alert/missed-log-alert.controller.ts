import { AlertType, UserRole } from '@prisma/client';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Query,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { EmailNotificationService } from './email-notification.service';
import { MissedLogAlertService } from './missed-log-alert.service';

const processAlertSchema = z.object({ stage: z.nativeEnum(AlertType) });
const testEmailSchema = z.object({
  recipient: z.string().trim().email().max(320),
});

@Controller('missed-log-alerts')
export class MissedLogAlertController {
  constructor(
    private readonly alerts: MissedLogAlertService,
    private readonly email: EmailNotificationService,
  ) {}

  @Get('me')
  @Roles(UserRole.FACULTY, UserRole.CAMPUS_MANAGER)
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('campusId') campusId?: string,
  ) {
    if (campusId && !z.string().uuid().safeParse(campusId).success)
      throw new BadRequestException('Invalid campus.');
    return this.alerts.listMine(user, campusId);
  }

  @Post('test-email')
  @Roles(UserRole.ADMIN, UserRole.PROGRAM_MANAGER)
  @HttpCode(200)
  async testEmail(@Body() body: unknown) {
    const parsed = testEmailSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid test recipient email.');
    }
    const message = await this.email.sendDeploymentTest(parsed.data.recipient);
    return { status: 'sent', providerMessageId: message.messageId };
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
