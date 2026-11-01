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
import { incidentInput, IncidentsService } from './incidents.service';

@Controller('incidents')
@UseGuards(MemberGuard)
export class IncidentsController {
  constructor(@Inject(IncidentsService) private readonly incidents: IncidentsService) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('state') state?: string) {
    const filter = state === 'open' || state === 'closed' ? state : undefined;
    return this.incidents.list(member.organizationId, filter);
  }

  @Post()
  report(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.incidents.report(member, parseBody(incidentInput, body));
  }

  @Get(':ref')
  get(@Member() member: CurrentMember, @Param('ref') ref: string) {
    return this.incidents.get(member.organizationId, ref);
  }

  @Put(':ref')
  update(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.incidents.update(member, ref, parseBody(incidentInput, body));
  }

  @Post(':ref/closure')
  close(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.incidents.close(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/reopening')
  reopen(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.incidents.reopen(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/deletion')
  @HttpCode(204)
  async delete(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    await this.incidents.delete(member, ref, parseBody(reasonInput, body).reason);
  }
}
