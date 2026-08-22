import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import type { RequestActor } from '../../common/auth.guard';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  create(
    @CurrentActor() actor: RequestActor,
    @Body() body: { familyUnitId: string; inviteeEmail: string; subjectPersonIds: string[]; role?: string },
  ) {
    return this.invitations.create(actor, body);
  }

  @Get()
  list(@CurrentActor() actor: RequestActor, @Query('familyUnitId') familyUnitId?: string) {
    return this.invitations.list(actor, familyUnitId);
  }

  @Get('eligible-subjects/list')
  eligibleSubjects(@CurrentActor() actor: RequestActor, @Query('familyUnitId') familyUnitId: string) {
    return this.invitations.eligibleSubjects(actor, familyUnitId);
  }

  @Get(':token')
  lookup(@CurrentActor({ requireOnboarded: false }) actor: RequestActor, @Param('token') token: string) {
    return this.invitations.lookup(actor, token);
  }

  @Post(':token/accept')
  accept(
    @CurrentActor({ requireOnboarded: false }) actor: RequestActor,
    @Param('token') token: string,
    @Body() body: { displayName: string },
  ) {
    return this.invitations.accept(actor, token, body.displayName);
  }
}
