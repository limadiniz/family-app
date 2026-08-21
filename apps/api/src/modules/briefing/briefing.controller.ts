import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { BriefingService } from './briefing.service';

@ApiTags('briefing')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class BriefingController {
  constructor(private readonly service: BriefingService) {}

  @Get('briefing/daily')
  getDaily(@CurrentActor() actor: RequestActor, @Query('date') date: string) {
    return this.service.getDailyBriefing(actor, date);
  }

  @Get('briefing/weekly')
  getWeekly(@CurrentActor() actor: RequestActor, @Query('weekStart') weekStart: string) {
    return this.service.getWeeklyBriefing(actor, weekStart);
  }

  @Get('activity-feed')
  getActivityFeed(@CurrentActor() actor: RequestActor, @Query('limit') limit?: string) {
    return this.service.getActivityFeed(actor, limit ? Number(limit) : undefined);
  }
}
