import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ControlsModule } from './controls/controls.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, ControlsModule],
  controllers: [HealthController],
})
export class AppModule {}
