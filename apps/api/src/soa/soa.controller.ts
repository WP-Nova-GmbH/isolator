import {
  Body,
  Controller,
  Delete,
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
import { parseBody } from '../validation';
import { evidenceInput, EvidenceService } from './evidence.service';
import { ownControlInput, soaEntryInput, SoaService } from './soa.service';

@Controller('soa')
@UseGuards(MemberGuard)
export class SoaController {
  constructor(
    @Inject(SoaService) private readonly soa: SoaService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
  ) {}

  @Get()
  list(@Member() member: CurrentMember) {
    return this.soa.list(member.organizationId);
  }

  @Post()
  addOwnControl(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.soa.addOwnControl(member, parseBody(ownControlInput, body).title);
  }

  @Get(':ref')
  get(@Member() member: CurrentMember, @Param('ref') ref: string) {
    return this.soa.get(member.organizationId, ref);
  }

  @Put(':ref')
  update(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.soa.update(member, ref, parseBody(soaEntryInput, body));
  }

  @Post(':ref/confirmations')
  confirm(@Member() member: CurrentMember, @Param('ref') ref: string) {
    return this.soa.confirm(member, ref);
  }

  @Post(':ref/evidence')
  addEvidence(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.evidence.add(member, ref, parseBody(evidenceInput, body));
  }
}

@Controller('evidence')
@UseGuards(MemberGuard)
export class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly evidence: EvidenceService) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('soa') ref?: string) {
    return this.evidence.list(member.organizationId, ref);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    await this.evidence.remove(member, id);
  }
}
