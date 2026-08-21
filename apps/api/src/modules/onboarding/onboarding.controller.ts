import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import type { RequestActor } from '../../common/auth.guard';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('bootstrap')
  bootstrap(@CurrentActor({ requireOnboarded: false }) actor: RequestActor, @Body() body: { displayName: string }) {
    return this.onboardingService.bootstrap(actor, body);
  }

  @Get('status')
  status(@CurrentActor({ requireOnboarded: false }) actor: RequestActor) {
    return this.onboardingService.status(actor);
  }
}
