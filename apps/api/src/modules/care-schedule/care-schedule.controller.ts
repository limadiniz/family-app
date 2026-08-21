import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { HandoffStatus } from '@family-app/domain';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { CareScheduleService } from './care-schedule.service';

@ApiTags('care-schedule')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('care-schedule')
export class CareScheduleController {
  constructor(private readonly service: CareScheduleService) {}

  // ------------------------------------------------------- CareSchedule

  @Post('schedules')
  createSchedule(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CareScheduleService['createSchedule']>[1]) {
    return this.service.createSchedule(actor, body);
  }

  @Get('schedules/:childPersonId')
  listSchedules(@CurrentActor() actor: RequestActor, @Param('childPersonId') childPersonId: string) {
    return this.service.listSchedules(actor, childPersonId);
  }

  @Post('schedules/:id/cancel')
  cancelSchedule(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.cancelSchedule(actor, id);
  }

  @Get('schedules/:id/occurrences')
  occurrences(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.occurrences(actor, id, from, to);
  }

  @Post('schedules/:id/materialize-window')
  materializeWindow(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() body: Parameters<CareScheduleService['materializeWindow']>[2],
  ) {
    return this.service.materializeWindow(actor, id, body);
  }

  // --------------------------------------------------------- CareWindow

  @Post('windows')
  createWindow(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CareScheduleService['createAdHocWindow']>[1]) {
    return this.service.createAdHocWindow(actor, body);
  }

  @Get('windows/:childPersonId')
  listWindows(
    @CurrentActor() actor: RequestActor,
    @Param('childPersonId') childPersonId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listWindows(actor, childPersonId, { from, to, status });
  }

  @Post('windows/:id/activate')
  activateWindow(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.setWindowStatus(actor, id, 'ACTIVE');
  }

  @Post('windows/:id/complete')
  completeWindow(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.setWindowStatus(actor, id, 'COMPLETED');
  }

  @Post('windows/:id/cancel')
  cancelWindow(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.setWindowStatus(actor, id, 'CANCELLED');
  }

  // ----------------------------------------------------------- Handoff

  @Post('handoffs')
  createHandoff(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CareScheduleService['createHandoff']>[1]) {
    return this.service.createHandoff(actor, body);
  }

  @Get('handoffs/:childPersonId')
  listHandoffs(
    @CurrentActor() actor: RequestActor,
    @Param('childPersonId') childPersonId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listHandoffs(actor, childPersonId, { from, to });
  }

  @Post('handoffs/:id/confirm')
  confirmHandoff(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.transition(actor, id, 'CONFIRMED' as HandoffStatus);
  }

  @Post('handoffs/:id/complete')
  completeHandoff(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.transition(actor, id, 'COMPLETED' as HandoffStatus);
  }

  @Post('handoffs/:id/delay')
  delayHandoff(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.transition(actor, id, 'DELAYED' as HandoffStatus);
  }

  @Post('handoffs/:id/cancel')
  cancelHandoff(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.transition(actor, id, 'CANCELLED' as HandoffStatus);
  }

  @Post('handoffs/:id/dispute')
  disputeHandoff(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.transition(actor, id, 'DISPUTED' as HandoffStatus);
  }
}
