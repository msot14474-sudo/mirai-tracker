import { AiInsightsModule } from '../ai-insights/ai-insights.module';
import { ReportDocumentService } from './report-document.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
@Module({
  imports: [DatabaseModule, AuthModule, AiInsightsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportDocumentService],
  exports: [ReportsService],
})
export class ReportsModule {}
