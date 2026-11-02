import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { parseBody, reasonInput } from '../validation';
import { NonconformitiesService, nonconformityInput } from './nonconformities.service';

@Controller('nonconformities')
@UseGuards(MemberGuard)
export class NonconformitiesController {
  constructor(
    @Inject(NonconformitiesService) private readonly nonconformities: NonconformitiesService,
  ) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('state') state?: string) {
    const filter = state === 'open' || state === 'closed' ? state : undefined;
    return this.nonconformities.list(member.organizationId, filter);
  }

  @Post()
  add(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.nonconformities.add(member, parseBody(nonconformityInput, body));
  }

  @Get(':ref')
  get(@Member() member: CurrentMember, @Param('ref') ref: string) {
    return this.nonconformities.get(member.organizationId, ref);
  }

  @Put(':ref')
  update(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.nonconformities.update(member, ref, parseBody(nonconformityInput, body));
  }

  @Post(':ref/closure')
  close(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.nonconformities.close(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/reopening')
  reopen(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.nonconformities.reopen(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/deletion')
  @HttpCode(204)
  async delete(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    await this.nonconformities.delete(member, ref, parseBody(reasonInput, body).reason);
  }
}
