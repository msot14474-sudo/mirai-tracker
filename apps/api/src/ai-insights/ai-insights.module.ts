import { AiConversationService } from './ai-conversation.service';
import { Module } from '@nestjs/common';
import { AiContextService } from './ai-context.service';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightsController } from './ai-insights.controller';
@Module({
  controllers: [AiInsightsController],
  providers: [AiConversationService, AiContextService, AiInsightsService],
})
export class AiInsightsModule {}
