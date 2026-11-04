import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { parseBody, reasonInput } from '../validation';
import { AdministratorsOnly, Member, MemberGuard, type CurrentMember } from './current-member';
import { MembersService, organizationInput, roleInput } from './members.service';

@Controller()
@UseGuards(MemberGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members/me')
  me(@Member() member: CurrentMember) {
    return member;
  }

  @Get('members')
  list(@Member() member: CurrentMember) {
    return this.members.list(member.organizationId);
  }

  @Put('members/:id/role')
  @AdministratorsOnly()
  @HttpCode(204)
  changeRole(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.members.changeRole(member, id, parseBody(roleInput, body).role);
  }

  @Post('members/:id/removal')
  @AdministratorsOnly()
  @HttpCode(204)
  remove(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.members.remove(member, id, parseBody(reasonInput, body).reason);
  }

  @Put('organization')
  @AdministratorsOnly()
  @HttpCode(204)
  rename(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.members.rename(member, parseBody(organizationInput, body).name);
  }
}
