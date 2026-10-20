import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AiInsightsModule } from '../ai-insights/ai-insights.module';
import { EmailNotificationService } from '../missed-log-alert/email-notification.service';
import { ActivityService } from './activity.service';
import { ActivityInterceptor } from './activity.interceptor';
import { WeeklySummaryService } from './weekly-summary.service';
import { NotificationsController } from './notifications.controller';
@Module({
  imports: [AiInsightsModule],
  controllers: [NotificationsController],
  providers: [
    ActivityService,
    WeeklySummaryService,
    EmailNotificationService,
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
})
export class NotificationsModule {}
