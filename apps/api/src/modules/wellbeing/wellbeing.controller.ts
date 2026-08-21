import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { WellbeingService } from './wellbeing.service';

@ApiTags('wellbeing')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class WellbeingController {
  constructor(private readonly service: WellbeingService) {}

  @Get('persons/:id/health-profile')
  getHealthProfile(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.getHealthProfile(actor, id);
  }

  @Post('persons/:id/health-profile')
  upsertHealthProfile(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() body: Parameters<WellbeingService['upsertHealthProfile']>[2]) {
    return this.service.upsertHealthProfile(actor, id, body);
  }

  @Post('medications')
  createMedication(@CurrentActor() actor: RequestActor, @Body() body: Parameters<WellbeingService['createMedication']>[1]) {
    return this.service.createMedication(actor, body);
  }

  @Get('persons/:id/medications')
  listMedications(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.listMedications(actor, id);
  }

  @Post('medications/administrations')
  recordAdministration(@CurrentActor() actor: RequestActor, @Body() body: Parameters<WellbeingService['recordAdministration']>[1]) {
    return this.service.recordAdministration(actor, body);
  }

  @Get('persons/:id/emergency-profile')
  getEmergencyProfile(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.getEmergencyProfile(actor, id);
  }

  @Post('persons/:id/emergency-profile')
  upsertEmergencyProfile(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() body: Parameters<WellbeingService['upsertEmergencyProfile']>[2]) {
    return this.service.upsertEmergencyProfile(actor, id, body);
  }
}
