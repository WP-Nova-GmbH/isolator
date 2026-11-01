import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { parseBody, reasonInput } from '../validation';
import { assetInput, AssetsService } from './assets.service';

@Controller('assets')
@UseGuards(MemberGuard)
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('state') state?: string) {
    return this.assets.list(member.organizationId, state === 'retired' ? 'retired' : 'active');
  }

  @Post()
  create(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.assets.create(member, parseBody(assetInput, body));
  }

  @Get(':id')
  get(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(member.organizationId, id);
  }

  @Put(':id')
  update(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.assets.update(member, id, parseBody(assetInput, body));
  }

  @Post(':id/retirement')
  retire(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.assets.retire(member, id, parseBody(reasonInput, body).reason);
  }

  @Post(':id/reinstatement')
  reinstate(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.assets.reinstate(member, id, parseBody(reasonInput, body).reason);
  }

  @Post(':id/deletion')
  @HttpCode(204)
  async delete(
    @Member() member: CurrentMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    await this.assets.delete(member, id, parseBody(reasonInput, body).reason);
  }
}
