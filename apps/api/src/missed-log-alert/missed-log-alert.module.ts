import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { EmailNotificationService } from './email-notification.service';
import { MissedLogAlertController } from './missed-log-alert.controller';
import { MissedLogAlertService } from './missed-log-alert.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [MissedLogAlertController],
  providers: [EmailNotificationService, MissedLogAlertService],
  exports: [MissedLogAlertService],
})
export class MissedLogAlertModule {}
