import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { AiService } from './ai.service';
import { AiProposalService } from './ai-proposal.service';
import { AuthorizedMemoryService } from './authorized-memory.service';
import { AiInsightsService } from './ai-insights.service';
import { SupervisedAgentService } from './supervised-agent.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly service: AiService,
    private readonly proposals: AiProposalService,
    private readonly memory: AuthorizedMemoryService,
    private readonly insights: AiInsightsService,
    private readonly supervisedAgent: SupervisedAgentService,
  ) {}

  @Get('insights')
  insightsForDay(@CurrentActor() actor: RequestActor, @Query('date') date?: string) {
    return this.insights.getForDay(actor, date ?? new Date().toISOString().slice(0, 10));
  }

  @Patch('insights/:id')
  updateInsight(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.insights.updateStatus(actor, id, status);
  }

  @Post('ask')
  ask(@CurrentActor() actor: RequestActor, @Body() body: { question: string }) {
    return this.service.ask(actor, body.question);
  }

  @Get('capabilities')
  capabilities() {
    return this.service.getCapabilities();
  }

  @Post('agent/run')
  runSupervisedAgent(@CurrentActor() actor: RequestActor, @Body('objective') objective: string) {
    return this.supervisedAgent.run(actor, objective);
  }

  @Get('memory')
  listMemory(
    @CurrentActor() actor: RequestActor,
    @Query('subjectPersonId') subjectPersonId: string,
  ) {
    return this.service.listMemory(actor, subjectPersonId);
  }

  @Post('memory')
  createMemory(
    @CurrentActor() actor: RequestActor,
    @Body() body: Parameters<AiService['createMemory']>[1],
  ) {
    return this.service.createMemory(actor, body);
  }

  @Patch('memory/:id/revoke')
  revokeMemory(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.revokeMemory(actor, id);
  }

  @Post('memory/:id/correct')
  correctMemory(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() body: Parameters<AuthorizedMemoryService['correct']>[2],
  ) {
    return this.memory.correct(actor, id, body);
  }

  @Get('memory/:id/usage')
  memoryUsage(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.memory.usage(actor, id);
  }

  @Get('memory-export')
  exportMemory(
    @CurrentActor() actor: RequestActor,
    @Query('subjectPersonId') subjectPersonId: string,
  ) {
    return this.memory.export(actor, subjectPersonId);
  }

  @Get('memory-preferences')
  memoryPreferences(@CurrentActor() actor: RequestActor) {
    return this.memory.getPreferences(actor);
  }

  @Patch('memory-preferences')
  updateMemoryPreferences(
    @CurrentActor() actor: RequestActor,
    @Body() body: Parameters<AuthorizedMemoryService['updatePreferences']>[1],
  ) {
    return this.memory.updatePreferences(actor, body);
  }

  @Get('proposals')
  listProposals(@CurrentActor() actor: RequestActor, @Query('status') status?: string) {
    return this.proposals.list(actor, status);
  }

  @Post('proposals')
  createProposal(
    @CurrentActor() actor: RequestActor,
    @Body() body: Parameters<AiProposalService['create']>[1],
  ) {
    return this.proposals.create(actor, body);
  }

  @Post('proposals/:id/confirm')
  confirmProposal(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() body: { expectedVersion: number; confirmed: boolean },
  ) {
    return this.proposals.confirm(actor, id, body.expectedVersion, body.confirmed);
  }

  @Post('proposals/:id/reject')
  rejectProposal(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body('expectedVersion') expectedVersion: number,
  ) {
    return this.proposals.reject(actor, id, expectedVersion);
  }

  @Post('proposals/:id/execute')
  executeProposal(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() body: { expectedVersion: number; confirmed: boolean },
  ) {
    return this.proposals.execute(actor, id, body.expectedVersion, body.confirmed);
  }
}
