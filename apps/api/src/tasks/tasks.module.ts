import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { NonconformitiesModule } from '../nonconformities/nonconformities.module';
import { RisksModule } from '../risks/risks.module';
import { SoaModule } from '../soa/soa.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [RisksModule, SuppliersModule, IncidentsModule, NonconformitiesModule, SoaModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
