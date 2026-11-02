import { Module } from '@nestjs/common';
import { NonconformitiesController } from './nonconformities.controller';
import { NonconformitiesService } from './nonconformities.service';

@Module({
  controllers: [NonconformitiesController],
  providers: [NonconformitiesService],
  exports: [NonconformitiesService],
})
export class NonconformitiesModule {}
