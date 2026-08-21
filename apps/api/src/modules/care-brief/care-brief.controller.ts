import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { CareBriefService } from './care-brief.service';

@ApiTags('care-brief')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('care-brief')
export class CareBriefController {
  constructor(private readonly service: CareBriefService) {}

  @Get('child/:childPersonId')
  getCareBrief(
    @CurrentActor() actor: RequestActor,
    @Param('childPersonId') childPersonId: string,
    @Query('date') date: string,
  ) {
    return this.service.getCareBrief(actor, childPersonId, date);
  }

  @Get('handoff/:handoffId')
  getHandoffBrief(@CurrentActor() actor: RequestActor, @Param('handoffId') handoffId: string) {
    return this.service.getHandoffBrief(actor, handoffId);
  }
}
