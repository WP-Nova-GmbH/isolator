import { Module } from '@nestjs/common';
import { InstallService } from './install.service';
import { InvitationsService } from './invitations.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController],
  providers: [InstallService, InvitationsService, OrganizationsService],
})
export class OrganizationsModule {}
