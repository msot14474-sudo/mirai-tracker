import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { CampusDataModule } from './campus-data/campus-data.module';
import { AiInsightsModule } from './ai-insights/ai-insights.module';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AcademicCalendarModule } from './academic-calendar/academic-calendar.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { SemesterImportModule } from './semester-import/semester-import.module';
import { TimetableModule } from './timetable/timetable.module';
import { LessonPlanModule } from './lesson-plan/lesson-plan.module';
import { TopicScheduleModule } from './topic-schedule/topic-schedule.module';
import { SessionLogModule } from './session-log/session-log.module';
import { ProgressModule } from './progress/progress.module';
import { StudentViewModule } from './student-view/student-view.module';
import { MissedLogAlertModule } from './missed-log-alert/missed-log-alert.module';
import { ExportModule } from './export/export.module';
import { FacultyAccessModule } from './faculty-access/faculty-access.module';
import { RequestTimingInterceptor } from './performance/request-timing.interceptor';
import { SafeHttpExceptionFilter } from './security/http-exception.filter';

@Module({
  imports: [
    ReportsModule,
    CampusDataModule,
    NotificationsModule,
    AiInsightsModule,
    WhatsAppModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    AuditModule,
    AcademicCalendarModule,
    SemesterImportModule,
    TimetableModule,
    LessonPlanModule,
    TopicScheduleModule,
    SessionLogModule,
    ProgressModule,
    StudentViewModule,
    MissedLogAlertModule,
    ExportModule,
    FacultyAccessModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestTimingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: SafeHttpExceptionFilter,
    },
  ],
})
export class AppModule {}
