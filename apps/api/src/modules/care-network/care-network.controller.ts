import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { CareNetworkService } from './care-network.service';

@ApiTags('care-network')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('care-network')
export class CareNetworkController {
  constructor(private readonly service: CareNetworkService) {}

  // ------------------------------------------------------- assignments

  @Post('assignments')
  create(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CareNetworkService['create']>[1]) {
    return this.service.create(actor, body);
  }

  @Get('assignments/incoming')
  incoming(@CurrentActor() actor: RequestActor) {
    return this.service.listIncoming(actor);
  }

  @Get('assignments/outgoing')
  outgoing(@CurrentActor() actor: RequestActor) {
    return this.service.listOutgoing(actor);
  }

  @Post('assignments/:id/accept')
  accept(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.accept(actor, id);
  }

  @Post('assignments/:id/decline')
  decline(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.decline(actor, id);
  }

  @Post('assignments/:id/cancel')
  cancel(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.cancel(actor, id);
  }

  @Post('assignments/:id/complete')
  complete(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.complete(actor, id);
  }

  @Post('assignments/:id/activate-fallback')
  activateFallback(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.activateFallback(actor, id);
  }

  // ----------------------------------------------------------- pool / "quem pode ajudar"

  @Get('members/:subjectPersonId')
  listMembers(@CurrentActor() actor: RequestActor, @Param('subjectPersonId') subjectPersonId: string) {
    return this.service.listMembers(actor, subjectPersonId);
  }

  @Post('members')
  addMember(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CareNetworkService['addMember']>[1]) {
    return this.service.addMember(actor, body);
  }

  @Post('members/:id/activate')
  activateMember(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.updateMemberStatus(actor, id, 'ACTIVE');
  }

  @Post('members/:id/deactivate')
  deactivateMember(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.updateMemberStatus(actor, id, 'INACTIVE');
  }

  // ------------------------------------------------------- recurring + availability

  @Post('recurring')
  createRecurring(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CareNetworkService['createRecurring']>[1]) {
    return this.service.createRecurring(actor, body);
  }

  @Get('recurring/:subjectPersonId')
  listRecurring(@CurrentActor() actor: RequestActor, @Param('subjectPersonId') subjectPersonId: string) {
    return this.service.listRecurring(actor, subjectPersonId);
  }

  @Post('recurring/:id/cancel')
  cancelRecurring(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.cancelRecurring(actor, id);
  }

  @Post('availability')
  setAvailability(@CurrentActor() actor: RequestActor, @Body('slots') slots: Parameters<CareNetworkService['setAvailability']>[1]) {
    return this.service.setAvailability(actor, slots);
  }

  @Get('availability/:personId')
  getAvailability(@CurrentActor() actor: RequestActor, @Param('personId') personId: string) {
    return this.service.getAvailability(actor, personId);
  }
}
