import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { parseBody, reasonInput } from '../validation';
import { Member, MemberGuard, type CurrentMember } from './current-member';
import { MembersService, organizationInput } from './members.service';

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

  @Post('members/:id/removal')
  @HttpCode(204)
  remove(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.members.remove(member, id, parseBody(reasonInput, body).reason);
  }

  @Put('organization')
  @HttpCode(204)
  rename(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.members.rename(member, parseBody(organizationInput, body).name);
  }
}
