import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacultyAccessController } from './faculty-access.controller';
import { FacultyAccessService } from './faculty-access.service';

@Module({
  imports: [AuthModule],
  controllers: [FacultyAccessController],
  providers: [FacultyAccessService],
})
export class FacultyAccessModule {}
