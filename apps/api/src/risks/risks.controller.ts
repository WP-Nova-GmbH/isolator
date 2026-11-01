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
import { z } from 'zod';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { parseBody, reasonInput } from '../validation';
import { RiskAssessmentsService } from './risk-assessments.service';
import { riskCriteriaInput, RiskCriteriaService } from './risk-criteria.service';
import { riskInput, RisksService } from './risks.service';

const linkInput = z.object({ id: z.uuid('Choose one from the list.') });

@Controller('risks')
@UseGuards(MemberGuard)
export class RisksController {
  constructor(@Inject(RisksService) private readonly risks: RisksService) {}

  @Get()
  list(@Member() member: CurrentMember, @Query('state') state?: string) {
    return this.risks.list(member.organizationId, state === 'closed' ? 'closed' : 'open');
  }

  @Post()
  create(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.risks.create(member, parseBody(riskInput, body));
  }

  @Get(':ref')
  get(@Member() member: CurrentMember, @Param('ref') ref: string) {
    return this.risks.get(member.organizationId, ref);
  }

  @Put(':ref')
  update(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.risks.update(member, ref, parseBody(riskInput, body));
  }

  @Post(':ref/confirmations')
  confirm(@Member() member: CurrentMember, @Param('ref') ref: string) {
    return this.risks.confirm(member, ref);
  }

  @Post(':ref/closure')
  close(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.risks.close(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/reopening')
  reopen(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    return this.risks.reopen(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/deletion')
  @HttpCode(204)
  async delete(@Member() member: CurrentMember, @Param('ref') ref: string, @Body() body: unknown) {
    await this.risks.delete(member, ref, parseBody(reasonInput, body).reason);
  }

  @Post(':ref/assets')
  @HttpCode(204)
  async linkAsset(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Body() body: unknown,
  ) {
    await this.risks.linkAsset(member, ref, parseBody(linkInput, body).id);
  }

  @Delete(':ref/assets/:id')
  @HttpCode(204)
  async unlinkAsset(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.risks.unlinkAsset(member, ref, id);
  }

  @Post(':ref/controls')
  @HttpCode(204)
  async linkControl(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Body() body: unknown,
  ) {
    await this.risks.linkControl(member, ref, parseBody(linkInput, body).id);
  }

  @Delete(':ref/controls/:id')
  @HttpCode(204)
  async unlinkControl(
    @Member() member: CurrentMember,
    @Param('ref') ref: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.risks.unlinkControl(member, ref, id);
  }
}

@Controller('risk-criteria')
@UseGuards(MemberGuard)
export class RiskCriteriaController {
  constructor(@Inject(RiskCriteriaService) private readonly criteria: RiskCriteriaService) {}

  @Get()
  async get(@Member() member: CurrentMember) {
    const [criteria, saved] = await Promise.all([
      this.criteria.get(member.organizationId),
      this.criteria.isSaved(member.organizationId),
    ]);
    return { ...criteria, saved };
  }

  @Put()
  save(@Member() member: CurrentMember, @Body() body: unknown) {
    return this.criteria.save(member, parseBody(riskCriteriaInput, body));
  }
}

@Controller('risk-assessments')
@UseGuards(MemberGuard)
export class RiskAssessmentsController {
  constructor(
    @Inject(RiskAssessmentsService) private readonly assessments: RiskAssessmentsService,
  ) {}

  @Get()
  list(@Member() member: CurrentMember) {
    return this.assessments.list(member.organizationId);
  }

  @Post()
  start(@Member() member: CurrentMember) {
    return this.assessments.start(member);
  }

  @Get(':id')
  get(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.get(member.organizationId, id);
  }

  @Post(':id/completion')
  complete(@Member() member: CurrentMember, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.complete(member, id);
  }
}
