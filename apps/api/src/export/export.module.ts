import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ProgressModule } from '../progress/progress.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [DatabaseModule, AuthModule, ProgressModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
