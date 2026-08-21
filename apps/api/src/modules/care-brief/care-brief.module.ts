import { Module } from '@nestjs/common';
import { CareBriefController } from './care-brief.controller';
import { CareBriefService } from './care-brief.service';

@Module({
  controllers: [CareBriefController],
  providers: [CareBriefService],
  exports: [CareBriefService],
})
export class CareBriefModule {}
