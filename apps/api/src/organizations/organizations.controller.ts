import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  Member,
  MemberGuard,
  User,
  UserGuard,
  type CurrentMember,
  type CurrentUser,
} from '../members/current-member';
import { parseBody } from '../validation';
import { claimInput, InstallService } from './install.service';
import { invitationInput, InvitationsService, newAccountInput } from './invitations.service';
import { newOrganizationInput, OrganizationsService } from './organizations.service';

@Controller()
export class OrganizationsController {
  constructor(
    private readonly install: InstallService,
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get('install')
  async status() {
    return { claimed: await this.install.claimed() };
  }

  @Post('install/claim')
  @HttpCode(204)
  claim(@Body() body: unknown) {
    return this.install.claim(parseBody(claimInput, body));
  }

  @Get('organizations')
  @UseGuards(UserGuard)
  async list(@User() user: CurrentUser) {
    return {
      me: { name: user.name, isOperator: user.isOperator },
      organizations: await this.organizations.list(user),
    };
  }

  @Post('organizations')
  @UseGuards(UserGuard)
  create(@User() user: CurrentUser, @Body() body: unknown) {
    return this.organizations.create(user, parseBody(newOrganizationInput, body));
  }

  @Post('organizations/:id/invitations')
  @UseGuards(UserGuard)
  inviteTo(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.organizations.invite(user, id, parseBody(invitationInput, body).email);
  }

  @Post('organizations/:id/activation')
  @UseGuards(UserGuard)
  @HttpCode(204)
  activate(@User() user: CurrentUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizations.activate(user, id);
  }

  @Get('invitations')
  @UseGuards(MemberGuard)
  listInvitations(@Member() member: CurrentMember) {
    return this.invitations.list(member.organizationId);
  }

  @Post('invitations')
  @UseGuards(MemberGuard)
  invite(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.invitations.invite(member, parseBody(invitationInput, body).email);
  }

  @Delete('invitations/:id')
  @UseGuards(MemberGuard)
  @HttpCode(204)
  revoke(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.revoke(member, id);
  }

  @Get('invites/:token')
  findInvite(@Param('token') token: string) {
    return this.invitations.find(token);
  }

  @Post('invites/:token/account')
  @HttpCode(204)
  acceptWithNewAccount(@Param('token') token: string, @Body() body: unknown) {
    return this.invitations.acceptWithNewAccount(token, parseBody(newAccountInput, body));
  }

  @Post('invites/:token/acceptance')
  @UseGuards(UserGuard)
  @HttpCode(204)
  accept(@User() user: CurrentUser, @Param('token') token: string) {
    return this.invitations.accept(token, user);
  }
}
