import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { TopicScheduleController } from './topic-schedule.controller';
import { TopicScheduleService } from './topic-schedule.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TopicScheduleController],
  providers: [TopicScheduleService],
  exports: [TopicScheduleService],
})
export class TopicScheduleModule {}
