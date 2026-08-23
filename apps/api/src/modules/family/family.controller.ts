import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import type { RequestActor } from '../../common/auth.guard';
import { FamilyService } from './family.service';

@ApiTags('family')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Get('persons')
  listPersons(@CurrentActor() actor: RequestActor) {
    return this.familyService.listPersonsInMyFamilies(actor);
  }

  @Get('persons/:id')
  getPerson(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.familyService.getPerson(actor, id);
  }

  @Patch('persons/:id')
  updatePerson(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.familyService.updatePerson(actor, id, body);
  }

  @Post('family-units')
  createFamilyUnit(@CurrentActor() actor: RequestActor, @Body() body: { name: string; kind?: string }) {
    return this.familyService.createFamilyUnit(actor, body);
  }

  @Get('family-units')
  listFamilyUnits(@CurrentActor() actor: RequestActor) {
    return this.familyService.listFamilyUnits(actor);
  }

  @Post('family-memberships')
  addFamilyMembership(
    @CurrentActor() actor: RequestActor,
    @Body() body: { familyUnitId: string; personId: string; role: string },
  ) {
    return this.familyService.addFamilyMembership(actor, body);
  }

  @Post('dependents')
  createDependent(
    @CurrentActor() actor: RequestActor,
    @Body() body: { displayName: string; birthDate?: string; familyUnitId: string },
  ) {
    return this.familyService.createDependent(actor, body);
  }

  @Post('relationships')
  createRelationship(
    @CurrentActor() actor: RequestActor,
    @Body() body: { fromPersonId: string; toPersonId: string; relationshipType: string },
  ) {
    return this.familyService.createRelationship(actor, body);
  }

  @Get('residences')
  listResidences(@CurrentActor() actor: RequestActor) {
    return this.familyService.listResidences(actor);
  }

  @Post('residences')
  createResidence(@CurrentActor() actor: RequestActor, @Body() body: Parameters<FamilyService['createResidence']>[1]) {
    return this.familyService.createResidence(actor, body);
  }

  @Patch('residences/:id')
  updateResidence(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() body: Parameters<FamilyService['updateResidence']>[2]) {
    return this.familyService.updateResidence(actor, id, body);
  }

  @Post('places/autocomplete')
  searchPlaces(@CurrentActor() actor: RequestActor, @Body() body: { query: string }) {
    return this.familyService.searchPlaces(actor, body);
  }

  @Get('places/:placeId')
  getPlaceDetails(@CurrentActor() actor: RequestActor, @Param('placeId') placeId: string) {
    return this.familyService.getPlaceDetails(actor, placeId);
  }

  @Post('residence-memberships')
  addResidenceMembership(
    @CurrentActor() actor: RequestActor,
    @Body() body: { residenceId: string; personId: string; isPrimary?: boolean },
  ) {
    return this.familyService.addResidenceMembership(actor, body);
  }

  @Get('persons/:id/routines')
  listRoutines(@CurrentActor() actor: RequestActor, @Param('id') personId: string) {
    return this.familyService.listRoutines(actor, personId);
  }

  @Post('persons/:id/routines')
  createRoutine(@CurrentActor() actor: RequestActor, @Param('id') personId: string, @Body() body: Parameters<FamilyService['createRoutine']>[2]) {
    return this.familyService.createRoutine(actor, personId, body);
  }

  @Patch('routines/:id')
  updateRoutine(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() body: Parameters<FamilyService['updateRoutine']>[2]) {
    return this.familyService.updateRoutine(actor, id, body);
  }

  @Post('travel-time')
  travelTime(@CurrentActor() actor: RequestActor, @Body() body: Parameters<FamilyService['estimateTravelTime']>[1]) {
    return this.familyService.estimateTravelTime(actor, body);
  }
}
