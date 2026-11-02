import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { nextNumber } from '../db/next-number';
import {
  auditEvents,
  controls,
  evidence,
  members,
  riskControls,
  risks,
  soaEntries,
  users,
} from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { ownerNameOf } from '../members/owner-name';
import { decisionOf, formatRiskRef } from '../risks/risk-decision';
import { fileState } from '../suppliers/supplier-rules';
import { today } from '../validation';

export const soaEntryInput = z.object({
  applicable: z.boolean(),
  status: z.enum(['not_started', 'planned', 'partial', 'implemented']),
  justification: z.string().trim(),
  ownerId: z.uuid('Choose an owner.').nullable(),
});

export const ownControlInput = z.object({
  title: z.string('Name the control.').trim().min(1, 'Name the control.'),
});

export type SoaEntryInput = z.output<typeof soaEntryInput>;

/** What a Confirmation decides on an SoA entry. */
export type SoaDecision = Pick<SoaEntryInput, 'applicable' | 'status' | 'justification'>;

type EntryRow = typeof soaEntries.$inferSelect;
type ControlRow = typeof controls.$inferSelect;

function decisionOfEntry({ applicable, status, justification }: SoaDecision): SoaDecision {
  return { applicable, status, justification };
}

function sameDecision(a: SoaDecision, b: SoaDecision) {
  return (
    a.applicable === b.applicable &&
    a.status === b.status &&
    a.justification === b.justification
  );
}

export function soaRef(entry: Pick<EntryRow, 'ownNumber'>, control: { ref: string } | null) {
  return control?.ref ?? `OWN-${entry.ownNumber}`;
}

export function soaTitle(entry: Pick<EntryRow, 'ownTitle'>, control: { title: string } | null) {
  return control?.title ?? entry.ownTitle ?? '';
}

@Injectable()
export class SoaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
  ) {}

  async list(organizationId: string) {
    await this.ensureEntries(organizationId);
    const [rows, proof, confirmations] = await Promise.all([
      this.rows(organizationId),
      this.db
        .select({ soaEntryId: evidence.soaEntryId, expiresOn: evidence.expiresOn })
        .from(evidence)
        .where(eq(evidence.organizationId, organizationId)),
      this.confirmations(organizationId),
    ]);
    const now = today();
    return rows
      .map((row) => {
        const own = proof.filter((item) => item.soaEntryId === row.entry.id);
        return {
          ...this.summary(row, confirmations.get(row.entry.id)),
          evidenceCount: own.length,
          expiredEvidence: own.filter((item) => fileState(item.expiresOn, now) === 'Expired')
            .length,
        };
      })
      .sort((a, b) => {
        if (a.own !== b.own) return a.own ? 1 : -1;
        return a.ref.localeCompare(b.ref, undefined, { numeric: true });
      });
  }

  async get(organizationId: string, ref: string) {
    const row = await this.entry(organizationId, ref);
    const [confirmations, history, linkedRisks] = await Promise.all([
      this.confirmations(organizationId),
      this.trail.forRecord(organizationId, row.entry.id),
      row.entry.controlId
        ? this.db
            .select({ risk: risks })
            .from(riskControls)
            .innerJoin(risks, eq(risks.id, riskControls.riskId))
            .where(
              and(
                eq(riskControls.organizationId, organizationId),
                eq(riskControls.controlId, row.entry.controlId),
                isNull(risks.closedAt),
                isNull(risks.deletedAt),
              ),
            )
        : [],
    ]);
    return {
      ...this.summary(row, confirmations.get(row.entry.id)),
      risks: linkedRisks.map(({ risk }) => ({
        ref: formatRiskRef(risk.number),
        title: risk.title,
        ...decisionOf(risk),
      })),
      history,
    };
  }

  async addOwnControl(member: CurrentMember, title: string) {
    const { organizationId } = member;
    const ownNumber = await this.db.transaction(async (tx) => {
      const next = await nextNumber(tx, organizationId, soaEntries);
      const [entry] = await tx
        .insert(soaEntries)
        .values({ organizationId, ownNumber: next, ownTitle: title })
        .returning();
      await recordEvent(tx, member, {
        action: 'soa.own_control_added',
        ...this.record(entry, null),
      });
      return next;
    });
    return { ref: `OWN-${ownNumber}` };
  }

  async update(member: CurrentMember, ref: string, input: SoaEntryInput) {
    const { organizationId } = member;
    const row = await this.entry(organizationId, ref);
    const ownerName = input.ownerId ? await ownerNameOf(this.db, organizationId, input.ownerId) : null;
    const before = { ...decisionOfEntry(row.entry), ownerName: row.ownerName };
    const after = { ...decisionOfEntry(input), ownerName };
    if (JSON.stringify(before) === JSON.stringify(after)) return { ref };
    await this.db.transaction(async (tx) => {
      await tx
        .update(soaEntries)
        .set(input)
        .where(and(eq(soaEntries.organizationId, organizationId), eq(soaEntries.id, row.entry.id)));
      await recordEvent(tx, member, {
        action: 'soa.changed',
        ...this.record(row.entry, row.control),
        before,
        after,
      });
    });
    return { ref };
  }

  async confirm(member: CurrentMember, ref: string) {
    const { organizationId } = member;
    const row = await this.entry(organizationId, ref);
    const decision = decisionOfEntry(row.entry);
    if (!decision.justification) {
      throw new ConflictException('Give a justification before confirming.');
    }
    const last = (await this.confirmations(organizationId)).get(row.entry.id);
    if (last && sameDecision(last.value, decision)) {
      throw new ConflictException('This entry is already confirmed.');
    }
    await recordEvent(this.db, member, {
      action: 'soa.confirmed',
      ...this.record(row.entry, row.control),
      before: last ? { ...last.value } : null,
      after: { ...decision },
    });
    return { ref };
  }

  /** The row behind a ref, for the services that attach things to an entry. */
  async entry(organizationId: string, ref: string) {
    const found = await this.find(organizationId, ref);
    if (found) return found;
    // A catalog entry may not exist yet in an Organization nobody has listed the SoA for.
    await this.ensureEntries(organizationId);
    const created = await this.find(organizationId, ref);
    if (!created) throw new NotFoundException('This SoA entry does not exist.');
    return created;
  }

  /** How an entry appears in the Audit trail. */
  record(entry: EntryRow, control: ControlRow | null) {
    return {
      recordType: 'soa_entry' as const,
      recordId: entry.id,
      recordRef: soaRef(entry, control),
      recordLabel: soaTitle(entry, control),
    };
  }

  /** The catalog is global, so each Organization's entries are created as they are needed. */
  private async ensureEntries(organizationId: string) {
    const catalog = await this.db.select({ id: controls.id }).from(controls);
    const [{ existing }] = await this.db
      .select({ existing: count() })
      .from(soaEntries)
      .where(eq(soaEntries.organizationId, organizationId));
    if (existing >= catalog.length) return;
    await this.db
      .insert(soaEntries)
      .values(catalog.map((control) => ({ organizationId, controlId: control.id })))
      .onConflictDoNothing();
  }

  private rows(organizationId: string, filter?: SQL) {
    return this.db
      .select({ entry: soaEntries, control: controls, ownerName: users.name })
      .from(soaEntries)
      .leftJoin(controls, eq(controls.id, soaEntries.controlId))
      .leftJoin(members, eq(members.id, soaEntries.ownerId))
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(eq(soaEntries.organizationId, organizationId), filter));
  }

  private async find(organizationId: string, ref: string) {
    const own = /^OWN-(\d+)$/.exec(ref);
    const [row] = await this.rows(
      organizationId,
      own ? eq(soaEntries.ownNumber, Number(own[1])) : eq(controls.ref, ref),
    );
    return row;
  }

  /** Each entry's latest Confirmation. */
  private async confirmations(organizationId: string) {
    const rows = await this.db
      .select({
        recordId: auditEvents.recordId,
        value: auditEvents.after,
        at: auditEvents.occurredAt,
        memberName: auditEvents.memberName,
      })
      .from(auditEvents)
      .where(
        and(eq(auditEvents.organizationId, organizationId), eq(auditEvents.action, 'soa.confirmed')),
      )
      .orderBy(desc(auditEvents.sequence));
    const latest = new Map<string, { value: SoaDecision; at: Date; memberName: string }>();
    for (const { recordId, value, at, memberName } of rows) {
      if (recordId && !latest.has(recordId)) {
        latest.set(recordId, { value: value as unknown as SoaDecision, at, memberName });
      }
    }
    return latest;
  }

  private summary(
    row: { entry: EntryRow; control: ControlRow | null; ownerName: string | null },
    last?: { value: SoaDecision; at: Date; memberName: string },
  ) {
    const { entry, control, ownerName } = row;
    const confirmed = last !== undefined && sameDecision(last.value, decisionOfEntry(entry));
    return {
      ref: soaRef(entry, control),
      title: soaTitle(entry, control),
      theme: control?.theme ?? 'own',
      own: control === null,
      applicable: entry.applicable,
      status: entry.status,
      justification: entry.justification,
      ownerId: entry.ownerId,
      ownerName,
      everConfirmed: last !== undefined,
      confirmation: confirmed ? { by: last.memberName, at: last.at } : null,
    };
  }
}
