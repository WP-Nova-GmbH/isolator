import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { nextNumber } from '../db/next-number';
import {
  assets,
  auditEvents,
  controls,
  members,
  riskAssets,
  riskControls,
  risks,
  tasks,
  users,
} from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { ownerNameOf, ownerOnReturn } from '../members/owner-name';
import { assertNoOpenTasks } from '../tasks/open-tasks';
import { RiskCriteriaService } from './risk-criteria.service';
import {
  confirmationBlocker,
  decisionOf,
  formatRiskRef,
  parseRiskRef,
  sameDecision,
  type RiskDecision,
} from './risk-decision';

const level = z.number().int().min(1).max(5);

export const riskInput = z
  .object({
    title: z.string().trim().min(1, 'Give the risk a title.'),
    description: z.string().trim(),
    ownerId: z.uuid('Choose a risk owner.'),
    likelihood: level,
    impact: level,
    residualLikelihood: level.nullable(),
    residualImpact: level.nullable(),
    treatment: z.enum(['mitigate', 'accept', 'transfer', 'avoid']).nullable(),
    reviewOn: z.iso.date('Choose a review date.'),
  })
  .refine((risk) => (risk.residualLikelihood === null) === (risk.residualImpact === null), {
    message: 'Rate both likelihood and impact after treatment, or neither.',
  });

export type RiskInput = z.output<typeof riskInput>;

type RiskRow = typeof risks.$inferSelect;

@Injectable()
export class RisksService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(RiskCriteriaService) private readonly criteria: RiskCriteriaService,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
  ) {}

  async list(organizationId: string, state: 'open' | 'closed' = 'open') {
    const rows = await this.rows(
      organizationId,
      state === 'open' ? isNull(risks.closedAt) : isNotNull(risks.closedAt),
    );
    const confirmations = await this.currentConfirmations(organizationId);
    return rows.map((row) => this.summary(row, confirmations.get(row.risk.id)));
  }

  async get(organizationId: string, ref: string) {
    const { row, confirmation } = await this.find(organizationId, ref);
    const riskId = row.risk.id;
    const [linkedAssets, linkedControls, history] = await Promise.all([
      this.db
        .select({ id: assets.id, name: assets.name })
        .from(riskAssets)
        .innerJoin(assets, eq(assets.id, riskAssets.assetId))
        .where(and(eq(riskAssets.organizationId, organizationId), eq(riskAssets.riskId, riskId)))
        .orderBy(asc(assets.name)),
      this.db
        .select({ id: controls.id, ref: controls.ref, title: controls.title })
        .from(riskControls)
        .innerJoin(controls, eq(controls.id, riskControls.controlId))
        .where(
          and(eq(riskControls.organizationId, organizationId), eq(riskControls.riskId, riskId)),
        ),
      this.trail.forRecord(organizationId, riskId),
    ]);
    return {
      ...this.summary(row, confirmation),
      description: row.risk.description,
      // A risk that was ever confirmed is a decision on record, so it can only be closed.
      everConfirmed: history.some((event) => event.action === 'risk.confirmed'),
      assets: linkedAssets,
      controls: linkedControls.sort((a, b) =>
        a.ref.localeCompare(b.ref, undefined, { numeric: true }),
      ),
      history,
    };
  }

  async create(member: CurrentMember, input: RiskInput) {
    const ownerName = await ownerNameOf(this.db, member.organizationId, input.ownerId);
    const number = await this.db.transaction(async (tx) => {
      const next = await nextNumber(tx, member.organizationId, risks);
      const [risk] = await tx
        .insert(risks)
        .values({ ...input, organizationId: member.organizationId, number: next })
        .returning();
      await recordEvent(tx, member, {
        action: 'risk.added',
        ...this.record(risk),
        after: this.snapshot(risk, ownerName),
      });
      return next;
    });
    return { ref: formatRiskRef(number) };
  }

  async update(member: CurrentMember, ref: string, input: RiskInput) {
    const ownerName = await ownerNameOf(this.db, member.organizationId, input.ownerId);
    const { row } = await this.findOpen(member.organizationId, ref);
    const before = this.snapshot(row.risk, row.ownerName);
    const after = this.snapshot(input, ownerName);
    if (JSON.stringify(before) === JSON.stringify(after)) return { ref };
    await this.db.transaction(async (tx) => {
      await tx.update(risks).set(input).where(this.scoped(member.organizationId, row.risk.id));
      await recordEvent(tx, member, {
        action: 'risk.changed',
        ...this.record({ ...row.risk, title: input.title }),
        before,
        after,
      });
    });
    return { ref };
  }

  async confirm(member: CurrentMember, ref: string) {
    const { row, confirmation } = await this.findOpen(member.organizationId, ref);
    this.assertOwner(row, member, 'confirm this rating and treatment');
    const decision = decisionOf(row.risk);
    if (confirmation && sameDecision(confirmation.value, decision)) {
      throw new ConflictException('This rating and treatment are already confirmed.');
    }
    const { acceptanceThreshold } = await this.criteria.get(member.organizationId);
    const blocker = confirmationBlocker(decision, acceptanceThreshold);
    if (blocker) throw new ConflictException(blocker);
    const [replaced] = await this.db
      .select({ after: auditEvents.after })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, member.organizationId),
          eq(auditEvents.recordId, row.risk.id),
          eq(auditEvents.action, 'risk.confirmed'),
        ),
      )
      .orderBy(desc(auditEvents.sequence))
      .limit(1);
    await recordEvent(this.db, member, {
      action: 'risk.confirmed',
      ...this.record(row.risk),
      before: replaced?.after ?? null,
      after: { ...decision },
    });
    return { ref };
  }

  async close(member: CurrentMember, ref: string, reason: string) {
    const { row } = await this.findOpen(member.organizationId, ref);
    this.assertOwner(row, member, 'close this risk');
    await assertNoOpenTasks(this.db, member, eq(tasks.riskId, row.risk.id));
    await this.db.transaction(async (tx) => {
      await tx
        .update(risks)
        .set({ closedAt: new Date(), closedReason: reason })
        .where(this.scoped(member.organizationId, row.risk.id));
      await recordEvent(tx, member, { action: 'risk.closed', ...this.record(row.risk), reason });
    });
    return { ref };
  }

  /** Back in the register, and it needs a new Confirmation. */
  async reopen(member: CurrentMember, ref: string, reason: string) {
    const { row } = await this.find(member.organizationId, ref);
    if (!row.risk.closedAt) throw new ConflictException('This risk is not closed.');
    const owner = await ownerOnReturn(this.db, member, row.risk, row.ownerName);
    if (owner.id === row.risk.ownerId) this.assertOwner(row, member, 'reopen this risk');
    await this.db.transaction(async (tx) => {
      await tx
        .update(risks)
        .set({ closedAt: null, closedReason: null, ownerId: owner.id })
        .where(this.scoped(member.organizationId, row.risk.id));
      await recordEvent(tx, member, {
        action: 'risk.reopened',
        ...this.record(row.risk),
        ...owner.change,
        reason,
      });
    });
    return { ref };
  }

  /** For a draft entered by mistake. The record and its trail stay; the risk leaves the register. */
  async delete(member: CurrentMember, ref: string, reason: string) {
    const { row } = await this.findOpen(member.organizationId, ref);
    const [{ confirmations }] = await this.db
      .select({ confirmations: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, member.organizationId),
          eq(auditEvents.recordId, row.risk.id),
          eq(auditEvents.action, 'risk.confirmed'),
        ),
      );
    if (confirmations > 0) {
      throw new ConflictException('This risk has a Confirmation, so it stays on record. Close it.');
    }
    await assertNoOpenTasks(this.db, member, eq(tasks.riskId, row.risk.id));
    await this.db.transaction(async (tx) => {
      await tx
        .update(risks)
        .set({ deletedAt: new Date() })
        .where(this.scoped(member.organizationId, row.risk.id));
      await recordEvent(tx, member, {
        action: 'risk.deleted',
        ...this.record(row.risk),
        before: this.snapshot(row.risk, row.ownerName),
        reason,
      });
    });
  }

  async linkAsset(member: CurrentMember, ref: string, assetId: string) {
    const { organizationId } = member;
    const { row } = await this.findOpen(organizationId, ref);
    const [asset] = await this.db
      .select({ id: assets.id, name: assets.name })
      .from(assets)
      .where(
        and(
          eq(assets.organizationId, organizationId),
          eq(assets.id, assetId),
          isNull(assets.retiredAt),
          isNull(assets.deletedAt),
        ),
      );
    if (!asset) throw new BadRequestException('Choose an asset from your register.');
    await this.db.transaction(async (tx) => {
      const linked = await tx
        .insert(riskAssets)
        .values({ organizationId, riskId: row.risk.id, assetId })
        .onConflictDoNothing()
        .returning();
      if (linked.length === 0) return;
      await recordEvent(tx, member, {
        action: 'risk.asset_linked',
        ...this.record(row.risk),
        after: { asset: asset.name },
      });
    });
  }

  async unlinkAsset(member: CurrentMember, ref: string, assetId: string) {
    const { organizationId } = member;
    const { row } = await this.findOpen(organizationId, ref);
    const [asset] = await this.db
      .select({ name: assets.name })
      .from(assets)
      .where(and(eq(assets.organizationId, organizationId), eq(assets.id, assetId)));
    await this.db.transaction(async (tx) => {
      const unlinked = await tx
        .delete(riskAssets)
        .where(
          and(
            eq(riskAssets.organizationId, organizationId),
            eq(riskAssets.riskId, row.risk.id),
            eq(riskAssets.assetId, assetId),
          ),
        )
        .returning();
      if (unlinked.length === 0) return;
      await recordEvent(tx, member, {
        action: 'risk.asset_unlinked',
        ...this.record(row.risk),
        before: { asset: asset.name },
      });
    });
  }

  async linkControl(member: CurrentMember, ref: string, controlId: string) {
    const { organizationId } = member;
    const { row } = await this.findOpen(organizationId, ref);
    const [control] = await this.db
      .select({ ref: controls.ref })
      .from(controls)
      .where(eq(controls.id, controlId));
    if (!control) throw new BadRequestException('Choose a control from the catalog.');
    await this.db.transaction(async (tx) => {
      const linked = await tx
        .insert(riskControls)
        .values({ organizationId, riskId: row.risk.id, controlId })
        .onConflictDoNothing()
        .returning();
      if (linked.length === 0) return;
      await recordEvent(tx, member, {
        action: 'risk.control_linked',
        ...this.record(row.risk),
        after: { control: control.ref },
      });
    });
  }

  async unlinkControl(member: CurrentMember, ref: string, controlId: string) {
    const { organizationId } = member;
    const { row } = await this.findOpen(organizationId, ref);
    const [control] = await this.db
      .select({ ref: controls.ref })
      .from(controls)
      .where(eq(controls.id, controlId));
    await this.db.transaction(async (tx) => {
      const unlinked = await tx
        .delete(riskControls)
        .where(
          and(
            eq(riskControls.organizationId, organizationId),
            eq(riskControls.riskId, row.risk.id),
            eq(riskControls.controlId, controlId),
          ),
        )
        .returning();
      if (unlinked.length === 0) return;
      await recordEvent(tx, member, {
        action: 'risk.control_unlinked',
        ...this.record(row.risk),
        before: { control: control.ref },
      });
    });
  }

  /** The id behind a ref, for services that link to a risk. A closed risk takes no new links. */
  async openIdOf(organizationId: string, ref: string) {
    const { row } = await this.findOpen(organizationId, ref);
    return row.risk.id;
  }

  /** The id behind a ref, closed or not, for reading what is linked to it. */
  async idOf(organizationId: string, ref: string) {
    const { row } = await this.find(organizationId, ref);
    return row.risk.id;
  }

  private scoped(organizationId: string, riskId: string) {
    return and(eq(risks.organizationId, organizationId), eq(risks.id, riskId));
  }

  private record(risk: Pick<RiskRow, 'id' | 'number' | 'title'>) {
    return {
      recordType: 'risk' as const,
      recordId: risk.id,
      recordRef: formatRiskRef(risk.number),
      recordLabel: risk.title,
    };
  }

  /** What the Audit trail keeps of a risk. */
  private snapshot(risk: RiskInput | RiskRow, ownerName: string) {
    return {
      title: risk.title,
      description: risk.description,
      ownerName,
      ...decisionOf(risk),
      reviewOn: risk.reviewOn,
    };
  }

  private rows(organizationId: string, filter?: SQL) {
    return this.db
      .select({ risk: risks, ownerName: users.name })
      .from(risks)
      .innerJoin(members, eq(members.id, risks.ownerId))
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(risks.organizationId, organizationId), isNull(risks.deletedAt), filter))
      .orderBy(asc(risks.number));
  }

  private async find(organizationId: string, ref: string) {
    const number = parseRiskRef(ref);
    if (number === null) throw new NotFoundException('This risk does not exist.');
    const [row] = await this.rows(organizationId, eq(risks.number, number));
    if (!row) throw new NotFoundException('This risk does not exist.');
    const confirmations = await this.currentConfirmations(organizationId);
    return { row, confirmation: confirmations.get(row.risk.id) };
  }

  private async findOpen(organizationId: string, ref: string) {
    const found = await this.find(organizationId, ref);
    if (found.row.risk.closedAt) throw new ConflictException('Reopen this risk to change it.');
    return found;
  }

  /** Each risk's latest Confirmation. Reopening a risk ends the one before it. */
  private async currentConfirmations(organizationId: string) {
    const rows = await this.db
      .select({
        riskId: auditEvents.recordId,
        action: auditEvents.action,
        value: auditEvents.after,
        at: auditEvents.occurredAt,
        memberName: auditEvents.memberName,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, organizationId),
          inArray(auditEvents.action, ['risk.confirmed', 'risk.reopened']),
        ),
      )
      .orderBy(desc(auditEvents.sequence));
    const seen = new Set<string>();
    const current = new Map<string, { value: RiskDecision; at: Date; memberName: string }>();
    for (const { riskId, action, value, at, memberName } of rows) {
      if (!riskId || seen.has(riskId)) continue;
      seen.add(riskId);
      if (action === 'risk.confirmed') {
        current.set(riskId, { value: value as unknown as RiskDecision, at, memberName });
      }
    }
    return current;
  }

  private summary(
    { risk, ownerName }: { risk: RiskRow; ownerName: string },
    confirmation?: { value: RiskDecision; at: Date; memberName: string },
  ) {
    const confirmed =
      confirmation !== undefined && sameDecision(confirmation.value, decisionOf(risk));
    return {
      ref: formatRiskRef(risk.number),
      title: risk.title,
      ownerId: risk.ownerId,
      ownerName,
      ...decisionOf(risk),
      reviewOn: risk.reviewOn,
      closedAt: risk.closedAt,
      closedReason: risk.closedReason,
      confirmation: confirmed ? { by: confirmation.memberName, at: confirmation.at } : null,
    };
  }

  private assertOwner(
    { risk, ownerName }: { risk: RiskRow; ownerName: string },
    member: CurrentMember,
    action: string,
  ) {
    if (risk.ownerId !== member.id) {
      throw new ForbiddenException(`Only ${ownerName}, the risk owner, can ${action}.`);
    }
  }
}
