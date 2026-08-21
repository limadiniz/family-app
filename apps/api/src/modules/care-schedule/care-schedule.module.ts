import { Module } from '@nestjs/common';
import { CareScheduleController } from './care-schedule.controller';
import { CareScheduleService } from './care-schedule.service';

@Module({
  controllers: [CareScheduleController],
  providers: [CareScheduleService],
  exports: [CareScheduleService],
})
export class CareScheduleModule {}
