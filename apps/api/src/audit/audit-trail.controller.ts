import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { Member, MemberGuard, type CurrentMember } from '../members/current-member';
import { AuditTrailService } from './audit-trail';

/** A positive whole number from the query, or nothing. */
function count(value?: string) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

@Controller('audit-events')
@UseGuards(MemberGuard)
export class AuditTrailController {
  constructor(@Inject(AuditTrailService) private readonly trail: AuditTrailService) {}

  @Get()
  list(
    @Member() member: CurrentMember,
    @Query('area') area?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    return this.trail.list(member.organizationId, area, {
      limit: count(limit),
      offset: count(offset),
      q,
    });
  }
}
