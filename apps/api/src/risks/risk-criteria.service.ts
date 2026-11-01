import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { riskCriteria } from '../db/schema';
import type { CurrentMember } from '../members/current-member';

const levels = z
  .array(z.string().trim().min(1, 'Say what each level means.'))
  .length(5, 'The matrix has five levels.');

export const riskCriteriaInput = z.object({
  acceptanceThreshold: z
    .number('Enter a threshold from 1 to 25.')
    .int('Enter a threshold from 1 to 25.')
    .min(1, 'Enter a threshold from 1 to 25.')
    .max(25, 'Enter a threshold from 1 to 25.'),
  likelihoodLevels: levels,
  impactLevels: levels,
});

export type RiskCriteriaInput = z.output<typeof riskCriteriaInput>;

const defaults: RiskCriteriaInput = {
  acceptanceThreshold: 8,
  likelihoodLevels: [
    'Less than once in ten years',
    'Once in five to ten years',
    'Once in two to five years',
    'About once a year',
    'Several times a year',
  ],
  impactLevels: [
    'No customer notices',
    'Internal disruption for a day',
    'One customer affected',
    'Several customers or a reportable breach',
    'Threatens the business',
  ],
};

@Injectable()
export class RiskCriteriaService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(organizationId: string): Promise<RiskCriteriaInput> {
    const [row] = await this.db
      .select({
        acceptanceThreshold: riskCriteria.acceptanceThreshold,
        likelihoodLevels: riskCriteria.likelihoodLevels,
        impactLevels: riskCriteria.impactLevels,
      })
      .from(riskCriteria)
      .where(eq(riskCriteria.organizationId, organizationId));
    return row ?? defaults;
  }

  /** Whether the Organization has set its own, rather than living on the defaults. */
  async isSaved(organizationId: string) {
    const [row] = await this.db
      .select({ organizationId: riskCriteria.organizationId })
      .from(riskCriteria)
      .where(eq(riskCriteria.organizationId, organizationId));
    return row !== undefined;
  }

  async save(member: CurrentMember, input: RiskCriteriaInput) {
    const { organizationId } = member;
    const before = await this.get(organizationId);
    if (JSON.stringify(before) === JSON.stringify(input)) return input;
    await this.db.transaction(async (tx) => {
      await tx
        .insert(riskCriteria)
        .values({ organizationId, ...input })
        .onConflictDoUpdate({ target: riskCriteria.organizationId, set: input });
      await recordEvent(tx, member, {
        action: 'risk_criteria.changed',
        recordType: 'risk_criteria',
        recordLabel: 'Risk criteria',
        before,
        after: input,
      });
    });
    return input;
  }
}
