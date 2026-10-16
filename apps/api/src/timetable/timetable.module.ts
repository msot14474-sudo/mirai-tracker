import { TopicScheduleModule } from '../topic-schedule/topic-schedule.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

@Module({
  imports: [AuthModule, TopicScheduleModule],
  controllers: [TimetableController],
  providers: [TimetableService],
  exports: [TimetableService],
})
export class TimetableModule {}
