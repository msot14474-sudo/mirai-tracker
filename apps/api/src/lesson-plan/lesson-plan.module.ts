import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { LessonPlanController } from './lesson-plan.controller';
import { LessonPlanService } from './lesson-plan.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [LessonPlanController],
  providers: [LessonPlanService],
})
export class LessonPlanModule {}
