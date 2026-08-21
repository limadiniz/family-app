import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth.guard';
import type { RequestActor } from '../../common/auth.guard';
import { CurrentActor } from '../../common/current-actor.decorator';
import { CommandCenterService } from './command-center.service';

@ApiTags('command-center')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class CommandCenterController {
  constructor(private readonly service: CommandCenterService) {}

  @Post('calendar-events')
  createCalendarEvent(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CommandCenterService['createCalendarEvent']>[1]) {
    return this.service.createCalendarEvent(actor, body);
  }

  @Get('calendar-events')
  listCalendarEvents(
    @CurrentActor() actor: RequestActor,
    @Query('subjectPersonId') subjectPersonId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listCalendarEvents(actor, { subjectPersonId, from, to });
  }

  @Post('tasks')
  createTask(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CommandCenterService['createTask']>[1]) {
    return this.service.createTask(actor, body);
  }

  @Get('tasks')
  listTasks(@CurrentActor() actor: RequestActor, @Query('responsiblePersonId') responsiblePersonId?: string, @Query('status') status?: string) {
    return this.service.listTasks(actor, { responsiblePersonId, status });
  }

  @Patch('tasks/:id/status')
  updateTaskStatus(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body('status') status: string) {
    return this.service.updateTaskStatus(actor, id, status);
  }

  @Post('routines')
  createRoutine(@CurrentActor() actor: RequestActor, @Body() body: Parameters<CommandCenterService['createRoutine']>[1]) {
    return this.service.createRoutine(actor, body);
  }

  @Get('routines')
  listRoutines(@CurrentActor() actor: RequestActor, @Query('subjectPersonId') subjectPersonId: string) {
    return this.service.listRoutines(actor, subjectPersonId);
  }

  @Post('routines/:id/items')
  addRoutineItem(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() body: { title: string; sortOrder?: number }) {
    return this.service.addRoutineItem(actor, id, body);
  }

  @Post('routine-items/:id/complete')
  completeRoutineItem(@CurrentActor() actor: RequestActor, @Param('id') id: string) {
    return this.service.completeRoutineItem(actor, id);
  }

  @Get('today')
  getToday(@CurrentActor() actor: RequestActor, @Query('subjectPersonId') subjectPersonId: string, @Query('date') date: string) {
    const day = date ?? new Date().toISOString().slice(0, 10);
    return this.service.getToday(actor, subjectPersonId, day);
  }
}
