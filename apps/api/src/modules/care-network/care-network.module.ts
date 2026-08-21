import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { CareNetworkController } from './care-network.controller';
import { CareNetworkService } from './care-network.service';

@Module({
  imports: [RequestsModule],
  controllers: [CareNetworkController],
  providers: [CareNetworkService],
  exports: [CareNetworkService],
})
export class CareNetworkModule {}
