import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AcademicCalendarController } from './academic-calendar.controller';
import { AcademicCalendarService } from './academic-calendar.service';

@Module({
  imports: [AuthModule],
  controllers: [AcademicCalendarController],
  providers: [AcademicCalendarService],
  exports: [AcademicCalendarService],
})
export class AcademicCalendarModule {}
