import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { members, riskAssessments, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { today } from '../validation';
import { RiskCriteriaService } from './risk-criteria.service';
import type { RegisterEntry, RiskDecision } from './risk-decision';
import { RisksService } from './risks.service';

function nextYear(isoDate: string) {
  const date = new Date(isoDate);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

/** Counts risks above the threshold, using the rating after treatment where there is one. */
function aboveThreshold(register: RiskDecision[], threshold: number) {
  return register.filter(
    (risk) =>
      (risk.residualLikelihood ?? risk.likelihood) * (risk.residualImpact ?? risk.impact) >
      threshold,
  ).length;
}

@Injectable()
export class RiskAssessmentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(RisksService) private readonly risks: RisksService,
    @Inject(RiskCriteriaService) private readonly criteria: RiskCriteriaService,
  ) {}

  async list(organizationId: string) {
    const [rows, currentRisks, { acceptanceThreshold }] = await Promise.all([
      this.db
        .select({ assessment: riskAssessments, completedBy: users.name })
        .from(riskAssessments)
        .leftJoin(members, eq(members.id, riskAssessments.completedById))
        .leftJoin(users, eq(users.id, members.userId))
        .where(eq(riskAssessments.organizationId, organizationId))
        .orderBy(desc(riskAssessments.startedOn), desc(riskAssessments.createdAt)),
      this.risks.list(organizationId),
      this.criteria.get(organizationId),
    ]);
    const assessments = rows.map(({ assessment, completedBy }) => {
      const register = assessment.register ?? currentRisks;
      const threshold = assessment.acceptanceThreshold ?? acceptanceThreshold;
      return {
        id: assessment.id,
        title: assessment.title,
        date: assessment.completedOn ?? assessment.startedOn,
        completed: assessment.completedOn !== null,
        risks: register.length,
        aboveThreshold: aboveThreshold(register, threshold),
        completedBy,
      };
    });
    return {
      assessments,
      // At least yearly, counted from the latest one.
      nextDue: assessments.length > 0 ? nextYear(assessments[0].date) : null,
    };
  }

  async get(organizationId: string, id: string) {
    const [row] = await this.db
      .select({ assessment: riskAssessments, completedBy: users.name })
      .from(riskAssessments)
      .leftJoin(members, eq(members.id, riskAssessments.completedById))
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(eq(riskAssessments.organizationId, organizationId), eq(riskAssessments.id, id)));
    if (!row?.assessment.register) {
      throw new NotFoundException('This Risk assessment is not complete.');
    }
    return {
      title: row.assessment.title,
      completedOn: row.assessment.completedOn,
      completedBy: row.completedBy,
      acceptanceThreshold: row.assessment.acceptanceThreshold,
      register: row.assessment.register,
    };
  }

  async start(member: CurrentMember) {
    const { organizationId } = member;
    const existing = await this.db
      .select({ completedOn: riskAssessments.completedOn })
      .from(riskAssessments)
      .where(eq(riskAssessments.organizationId, organizationId));
    if (existing.some((row) => row.completedOn === null)) {
      throw new ConflictException('A Risk assessment is already in progress.');
    }
    return this.db.transaction(async (tx) => {
      const [assessment] = await tx
        .insert(riskAssessments)
        .values({
          organizationId,
          title: existing.length === 0 ? 'First Risk assessment' : 'Yearly review',
          startedOn: today(),
        })
        .returning();
      await recordEvent(tx, member, {
        action: 'risk_assessment.started',
        recordType: 'risk_assessment',
        recordId: assessment.id,
        recordLabel: assessment.title,
      });
      return { id: assessment.id };
    });
  }

  async complete(member: CurrentMember, id: string) {
    const risks = await this.risks.list(member.organizationId);
    if (risks.length === 0) {
      throw new ConflictException('Add a risk before you complete this Risk assessment.');
    }
    const unconfirmed = risks.filter((risk) => risk.confirmation === null).length;
    if (unconfirmed > 0) {
      const risksLeft = unconfirmed === 1 ? '1 risk needs' : `${unconfirmed} risks need`;
      throw new ConflictException(
        `${risksLeft} a Confirmation before you can complete this Risk assessment.`,
      );
    }
    const { acceptanceThreshold } = await this.criteria.get(member.organizationId);
    const register: RegisterEntry[] = risks.map(({ ownerId: _ownerId, confirmation, ...risk }) => ({
      ...risk,
      confirmedBy: confirmation!.by,
      confirmedOn: confirmation!.at.toISOString().slice(0, 10),
    }));
    return this.db.transaction(async (tx) => {
      const [completed] = await tx
        .update(riskAssessments)
        .set({
          completedOn: today(),
          completedById: member.id,
          acceptanceThreshold,
          register,
        })
        .where(
          and(
            eq(riskAssessments.organizationId, member.organizationId),
            eq(riskAssessments.id, id),
            isNull(riskAssessments.completedOn),
          ),
        )
        .returning();
      if (!completed) throw new NotFoundException('This Risk assessment is not in progress.');
      await recordEvent(tx, member, {
        action: 'risk_assessment.completed',
        recordType: 'risk_assessment',
        recordId: completed.id,
        recordLabel: completed.title,
        after: { risks: register.length, acceptanceThreshold },
      });
      return { id: completed.id };
    });
  }
}
