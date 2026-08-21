import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { RequestsService } from './requests.service';

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Post()
  create(@CurrentActor() actor: RequestActor, @Body() body: Parameters<RequestsService['create']>[1]) {
    return this.service.create(actor, body);
  }

  @Get('incoming')
  incoming(@CurrentActor() actor: RequestActor) {
    return this.service.listIncoming(actor);
  }

  @Get('outgoing')
  outgoing(@CurrentActor() actor: RequestActor) {
    return this.service.listOutgoing(actor);
  }

  @Post(':id/view')
  view(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.markViewed(actor, id);
  }

  @Post(':id/accept')
  accept(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body('note') note?: string) {
    return this.service.accept(actor, id, note);
  }

  @Post(':id/decline')
  decline(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body('note') note?: string) {
    return this.service.decline(actor, id, note);
  }

  @Post(':id/cancel')
  cancel(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.cancel(actor, id);
  }

  @Post(':id/dispute')
  dispute(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body('note') note: string) {
    return this.service.dispute(actor, id, note);
  }
}
