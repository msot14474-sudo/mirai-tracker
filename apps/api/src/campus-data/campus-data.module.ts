import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { TimetableModule } from '../timetable/timetable.module';
import { TopicScheduleModule } from '../topic-schedule/topic-schedule.module';
import { ProgressModule } from '../progress/progress.module';
import { CampusDataController } from './campus-data.controller';
import { SemesterBundleService } from './semester-bundle.service';
import { VisitingFacultyService } from './visiting-faculty.service';
@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    TimetableModule,
    TopicScheduleModule,
    ProgressModule,
  ],
  controllers: [CampusDataController],
  providers: [SemesterBundleService, VisitingFacultyService],
})
export class CampusDataModule {}
