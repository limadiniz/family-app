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
import { AiVectorIndexerService } from './ai-vector-indexer.service';
import { AiVectorShadowService } from './ai-vector-shadow.service';
import { AiResponseCacheService } from './ai-response-cache.service';
import { McpProxyService } from './mcp-proxy.service';
import { SupervisedAgentService } from './supervised-agent.service';

@Module({
  imports: [CommandCenterModule, RequestsModule, CareNetworkModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiProposalService,
    AuthorizedMemoryService,
    AiInsightsService,
    AiMetricsService,
    AiVectorIndexerService,
    AiVectorShadowService,
    AiResponseCacheService,
    McpProxyService,
    SupervisedAgentService,
  ],
  exports: [
    AiService,
    AiProposalService,
    AuthorizedMemoryService,
    AiInsightsService,
    AiMetricsService,
    AiVectorIndexerService,
    AiVectorShadowService,
    AiResponseCacheService,
    McpProxyService,
    SupervisedAgentService,
  ],
})
export class AiModule {}
