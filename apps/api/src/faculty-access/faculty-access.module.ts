import { StudentImportService } from './student-import.service';
import { StudentImportController } from './student-import.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacultyAccessController } from './faculty-access.controller';
import { FacultyAccessService } from './faculty-access.service';

@Module({
  imports: [AuthModule],
  controllers: [FacultyAccessController, StudentImportController],
  providers: [FacultyAccessService, StudentImportService],
})
export class FacultyAccessModule {}
