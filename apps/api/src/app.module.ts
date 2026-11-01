import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetsModule } from './assets/assets.module';
import { AuditTrailModule } from './audit/audit-trail.module';
import { AuthModule } from './auth/auth.module';
import { ControlsModule } from './controls/controls.module';
import { DbModule } from './db/db.module';
import { DocumentsModule } from './documents/documents.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health/health.controller';
import { IncidentsModule } from './incidents/incidents.module';
import { MembersModule } from './members/members.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RisksModule } from './risks/risks.module';
import { SoaModule } from './soa/soa.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    AuditTrailModule,
    ControlsModule,
    FilesModule,
    MembersModule,
    OrganizationsModule,
    AssetsModule,
    RisksModule,
    SuppliersModule,
    IncidentsModule,
    SoaModule,
    DocumentsModule,
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
