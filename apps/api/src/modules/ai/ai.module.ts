import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProposalService } from './ai-proposal.service';
import { CommandCenterModule } from '../command-center/command-center.module';
import { RequestsModule } from '../requests/requests.module';
import { CareNetworkModule } from '../care-network/care-network.module';
import { AuthorizedMemoryService } from './authorized-memory.service';
import { AiInsightsService } from './ai-insights.service';
import { AiMetricsService } from './ai-metrics.service';

@Module({
  imports: [CommandCenterModule, RequestsModule, CareNetworkModule],
  controllers: [AiController],
  providers: [AiService, AiProposalService, AuthorizedMemoryService, AiInsightsService, AiMetricsService],
  exports: [AiService, AiProposalService, AuthorizedMemoryService, AiInsightsService, AiMetricsService],
})
export class AiModule {}
