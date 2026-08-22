import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { AiService } from './ai.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('ask')
  ask(@CurrentActor() actor: RequestActor, @Body() body: { question: string; subjectPersonIds: string[] }) {
    return this.service.ask(actor, body.question, body.subjectPersonIds);
  }

  @Get('memory')
  listMemory(@CurrentActor() actor: RequestActor, @Query('subjectPersonId') subjectPersonId: string) {
    return this.service.listMemory(actor, subjectPersonId);
  }

  @Post('memory')
  createMemory(@CurrentActor() actor: RequestActor, @Body() body: Parameters<AiService['createMemory']>[1]) {
    return this.service.createMemory(actor, body);
  }

  @Patch('memory/:id/revoke')
  revokeMemory(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.revokeMemory(actor, id);
  }
}
