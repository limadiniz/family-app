import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { CaptureService } from './capture.service';

@ApiTags('capture')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('capture')
export class CaptureController {
  constructor(private readonly service: CaptureService) {}

  @Post('items')
  create(@CurrentActor() actor: RequestActor, @Body() body: { source: string; rawText?: string; subjectPersonId?: string }) {
    return this.service.createCaptureItem(actor, body);
  }

  @Get('items')
  list(@CurrentActor() actor: RequestActor, @Query('status') status?: string) {
    return this.service.listMyCaptureItems(actor, status);
  }

  @Get('items/:id')
  get(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.getCaptureItem(actor, id);
  }

  @Post('proposals/:id/confirm')
  confirm(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() edits: Record<string, unknown> = {}) {
    return this.service.confirmProposal(actor, id, edits);
  }

  @Post('proposals/:id/reject')
  reject(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.rejectProposal(actor, id);
  }
}
