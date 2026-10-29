import { Module } from '@nestjs/common';
import { ControlsController } from './controls.controller';

@Module({
  controllers: [ControlsController],
})
export class ControlsModule {}
