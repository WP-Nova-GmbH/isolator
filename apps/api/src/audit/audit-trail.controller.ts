import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { AuditTrailService } from './audit-trail';

@Controller('audit-events')
@UseGuards(MemberGuard)
export class AuditTrailController {
  constructor(@Inject(AuditTrailService) private readonly trail: AuditTrailService) {}

  @Get()
  list(
    @Member() member: CurrentMember,
    @Query('area') area?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trail.list(member.organizationId, area, limit ? Number(limit) : undefined);
  }
}
