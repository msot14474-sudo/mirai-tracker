import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StudentViewController } from './student-view.controller';
import { StudentViewService } from './student-view.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [StudentViewController],
  providers: [StudentViewService],
})
export class StudentViewModule {}
