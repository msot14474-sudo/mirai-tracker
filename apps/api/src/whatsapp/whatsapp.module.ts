import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionLogModule } from '../session-log/session-log.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
@Module({
  imports: [AuthModule, SessionLogModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
})
export class WhatsAppModule {}
