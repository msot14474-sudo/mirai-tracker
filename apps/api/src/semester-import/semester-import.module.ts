import { ProgressImportService } from './progress-import.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SemesterImportController } from './semester-import.controller';
import { SemesterImportService } from './semester-import.service';

@Module({
  imports: [AuthModule],
  controllers: [SemesterImportController],
  providers: [SemesterImportService, ProgressImportService],
  exports: [SemesterImportService],
})
export class SemesterImportModule {}
