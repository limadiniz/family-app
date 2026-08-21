import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { FamilyModule } from './modules/family/family.module';
import { CommandCenterModule } from './modules/command-center/command-center.module';
import { CaptureModule } from './modules/capture/capture.module';
import { RequestsModule } from './modules/requests/requests.module';
import { WellbeingModule } from './modules/wellbeing/wellbeing.module';
import { CareNetworkModule } from './modules/care-network/care-network.module';
import { CareScheduleModule } from './modules/care-schedule/care-schedule.module';
import { CareBriefModule } from './modules/care-brief/care-brief.module';
import { AiModule } from './modules/ai/ai.module';
import { BriefingModule } from './modules/briefing/briefing.module';

@Module({
  imports: [
    CommonModule,
    HealthModule,
    AccountsModule,
    OnboardingModule,
    FamilyModule,
    CommandCenterModule,
    CaptureModule,
    RequestsModule,
    WellbeingModule,
    CareNetworkModule,
    CareScheduleModule,
    CareBriefModule,
    AiModule,
    BriefingModule,
  ],
})
export class AppModule {}
