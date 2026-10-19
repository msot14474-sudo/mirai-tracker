import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SessionLogController } from './session-log.controller';
import { SessionLogService } from './session-log.service';
import { TopicScheduleModule } from '../topic-schedule/topic-schedule.module';

@Module({
  imports: [DatabaseModule, AuthModule, TopicScheduleModule],
  controllers: [SessionLogController],
  providers: [SessionLogService],
  exports: [SessionLogService],
})
export class SessionLogModule {}
