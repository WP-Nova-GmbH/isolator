import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { assetSuppliers, assets, members, riskAssets, risks, suppliers, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { canOwn, optionalOwnerNameOf, ownerOnReturn } from '../members/owner-name';
import { formatRiskRef } from '../risks/risk-decision';
import { formatSupplierRef } from '../suppliers/supplier-rules';

// Null owners are unassigned, and a null classification is not known yet.
export const assetInput = z.object({
  name: z.string().trim().min(1, 'Give the asset a name.'),
  type: z.enum(['information', 'software', 'hardware', 'service', 'people', 'site']),
  status: z.enum(['planned', 'operational']),
  classification: z
    .enum(['public', 'internal', 'confidential', 'strictly_confidential'])
    .nullable(),
  ownerId: z.uuid('Choose a business owner.').nullable(),
  technicalOwnerId: z.uuid('Choose a technical owner.').nullable(),
  location: z.string().trim(),
  validation: z.enum(['unvalidated', 'validated']),
  source: z.string().trim(),
  notes: z.string().trim(),
});

export type AssetInput = z.output<typeof assetInput>;

type AssetRow = typeof assets.$inferSelect;

const technicalMembers = alias(members, 'technical_members');
const technicalUsers = alias(users, 'technical_users');

interface OwnerNames {
  ownerName: string | null;
  technicalOwnerName: string | null;
}

type LinkedSupplier = { ref: string; name: string };

@Injectable()
export class AssetsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
  ) {}

  async list(organizationId: string, state: 'active' | 'retired' = 'active') {
    const openRisks = this.db
      .select({ assetId: riskAssets.assetId, risks: count().as('risks') })
      .from(riskAssets)
      .innerJoin(risks, eq(risks.id, riskAssets.riskId))
      .where(
        and(
          eq(riskAssets.organizationId, organizationId),
          isNull(risks.closedAt),
          isNull(risks.deletedAt),
        ),
      )
      .groupBy(riskAssets.assetId)
      .as('open_risks');
    const [rows, counts, links] = await Promise.all([
      this.rows(
        organizationId,
        state === 'active' ? isNull(assets.retiredAt) : isNotNull(assets.retiredAt),
      ).orderBy(asc(assets.name)),
      this.db.select().from(openRisks),
      this.suppliersOf(organizationId),
    ]);
    return rows.map((row) => ({
      ...this.fields(row, links.get(row.asset.id) ?? []),
      risks: counts.find((count) => count.assetId === row.asset.id)?.risks ?? 0,
    }));
  }

  async get(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const [linkedRisks, history, [{ everLinked }], links] = await Promise.all([
      this.db
        .select({ number: risks.number, title: risks.title })
        .from(riskAssets)
        .innerJoin(risks, eq(risks.id, riskAssets.riskId))
        .where(
          and(
            eq(riskAssets.organizationId, organizationId),
            eq(riskAssets.assetId, id),
            isNull(risks.closedAt),
            isNull(risks.deletedAt),
          ),
        )
        .orderBy(asc(risks.number)),
      this.trail.forRecord(organizationId, id),
      this.db
        .select({ everLinked: count() })
        .from(riskAssets)
        .where(and(eq(riskAssets.organizationId, organizationId), eq(riskAssets.assetId, id))),
      this.suppliersOf(organizationId, id),
    ]);
    return {
      ...this.fields(row, links.get(id) ?? []),
      // A risk points at it, even if that risk is closed, so it can only be retired.
      deletable: everLinked === 0,
      risks: linkedRisks.map((risk) => ({ ref: formatRiskRef(risk.number), title: risk.title })),
      history,
    };
  }

  async create(member: CurrentMember, input: AssetInput) {
    const { organizationId } = member;
    const names = await this.ownerNames(organizationId, input);
    return this.db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(assets)
        .values({ organizationId, ...input })
        .returning();
      await recordEvent(tx, member, {
        action: 'asset.added',
        recordType: 'asset',
        recordId: asset.id,
        recordLabel: asset.name,
        after: this.snapshot(input, names),
      });
      return { id: asset.id };
    });
  }

  async update(member: CurrentMember, id: string, input: AssetInput) {
    const { organizationId } = member;
    const names = await this.ownerNames(organizationId, input);
    const row = await this.find(organizationId, id);
    if (row.asset.retiredAt) throw new ConflictException('Reinstate this asset to change it.');
    const before = this.snapshot(row.asset, row);
    const after = this.snapshot(input, names);
    if (JSON.stringify(before) === JSON.stringify(after)) return { id };
    await this.db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set(input)
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, id)));
      await recordEvent(tx, member, {
        action: 'asset.changed',
        recordType: 'asset',
        recordId: id,
        recordLabel: input.name,
        before,
        after,
      });
    });
    return { id };
  }

  /** No longer in use. It stays on record, and open risks have to move off it first. */
  async retire(member: CurrentMember, id: string, reason: string) {
    const { organizationId } = member;
    const row = await this.find(organizationId, id);
    if (row.asset.retiredAt) throw new ConflictException('This asset is already retired.');
    const [{ open }] = await this.db
      .select({ open: count() })
      .from(riskAssets)
      .innerJoin(risks, eq(risks.id, riskAssets.riskId))
      .where(
        and(
          eq(riskAssets.organizationId, organizationId),
          eq(riskAssets.assetId, id),
          isNull(risks.closedAt),
          isNull(risks.deletedAt),
        ),
      );
    if (open > 0) {
      throw new ConflictException(
        open === 1
          ? 'An open risk still points at this asset. Remove the link first.'
          : `${open} open risks still point at this asset. Remove the links first.`,
      );
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ retiredAt: new Date(), retiredReason: reason })
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, id)));
      await this.unlinkSuppliers(tx, organizationId, id);
      await recordEvent(tx, member, {
        action: 'asset.retired',
        recordType: 'asset',
        recordId: id,
        recordLabel: row.asset.name,
        reason,
      });
    });
    return { id };
  }

  async reinstate(member: CurrentMember, id: string, reason: string) {
    const { organizationId } = member;
    const row = await this.find(organizationId, id);
    if (!row.asset.retiredAt) throw new ConflictException('This asset is not retired.');
    const owner = await ownerOnReturn(this.db, member, row.asset, row.ownerName);
    // A technical owner who has left is no longer assigned.
    const technicalLeft =
      row.asset.technicalOwnerId !== null &&
      !(await canOwn(this.db, organizationId, row.asset.technicalOwnerId));
    const change = technicalLeft
      ? {
          before: { ...owner.change.before, technicalOwnerName: row.technicalOwnerName },
          after: { ...owner.change.after, technicalOwnerName: null },
        }
      : owner.change;
    await this.db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({
          retiredAt: null,
          retiredReason: null,
          ownerId: owner.id,
          ...(technicalLeft && { technicalOwnerId: null }),
        })
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, id)));
      await recordEvent(tx, member, {
        action: 'asset.reinstated',
        recordType: 'asset',
        recordId: id,
        recordLabel: row.asset.name,
        ...change,
        reason,
      });
    });
    return { id };
  }

  /** For an entry made by mistake. The record and its trail stay; it leaves the register. */
  async delete(member: CurrentMember, id: string, reason: string) {
    const { organizationId } = member;
    const row = await this.find(organizationId, id);
    if (row.asset.retiredAt) throw new ConflictException('Reinstate this asset to change it.');
    const [{ linked }] = await this.db
      .select({ linked: count() })
      .from(riskAssets)
      .where(and(eq(riskAssets.organizationId, organizationId), eq(riskAssets.assetId, id)));
    if (linked > 0) {
      throw new ConflictException('A risk points at this asset, so it stays on record. Retire it.');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ deletedAt: new Date() })
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, id)));
      await this.unlinkSuppliers(tx, organizationId, id);
      await recordEvent(tx, member, {
        action: 'asset.deleted',
        recordType: 'asset',
        recordId: id,
        recordLabel: row.asset.name,
        before: this.snapshot(row.asset, row),
        reason,
      });
    });
  }

  /** What the Audit trail keeps of an asset. */
  private snapshot(
    asset: Omit<AssetInput, 'ownerId' | 'technicalOwnerId'>,
    { ownerName, technicalOwnerName }: OwnerNames,
  ) {
    return {
      name: asset.name,
      type: asset.type,
      status: asset.status,
      classification: asset.classification,
      ownerName,
      technicalOwnerName,
      location: asset.location,
      validation: asset.validation,
      source: asset.source,
      notes: asset.notes,
    };
  }

  private async ownerNames(organizationId: string, input: AssetInput): Promise<OwnerNames> {
    const [ownerName, technicalOwnerName] = await Promise.all([
      optionalOwnerNameOf(this.db, organizationId, input.ownerId),
      optionalOwnerNameOf(this.db, organizationId, input.technicalOwnerId),
    ]);
    return { ownerName, technicalOwnerName };
  }

  /** What the register and an asset's page show of it. */
  private fields(
    { asset, ownerName, technicalOwnerName }: { asset: AssetRow } & OwnerNames,
    linkedSuppliers: LinkedSupplier[],
  ) {
    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      classification: asset.classification,
      ownerId: asset.ownerId,
      ownerName,
      technicalOwnerId: asset.technicalOwnerId,
      technicalOwnerName,
      location: asset.location,
      validation: asset.validation,
      source: asset.source,
      notes: asset.notes,
      retiredAt: asset.retiredAt,
      retiredReason: asset.retiredReason,
      suppliers: linkedSuppliers,
    };
  }

  /** The Suppliers of each asset, or of one, in register order. */
  private async suppliersOf(organizationId: string, assetId?: string) {
    const rows = await this.db
      .select({ assetId: assetSuppliers.assetId, number: suppliers.number, name: suppliers.name })
      .from(assetSuppliers)
      .innerJoin(suppliers, eq(suppliers.id, assetSuppliers.supplierId))
      .where(
        and(
          eq(assetSuppliers.organizationId, organizationId),
          assetId ? eq(assetSuppliers.assetId, assetId) : undefined,
        ),
      )
      .orderBy(asc(suppliers.number));
    const links = new Map<string, LinkedSupplier[]>();
    for (const row of rows) {
      const list = links.get(row.assetId) ?? [];
      list.push({ ref: formatSupplierRef(row.number), name: row.name });
      links.set(row.assetId, list);
    }
    return links;
  }

  /** A retired or deleted asset leaves its Suppliers, so they can end. */
  private unlinkSuppliers(tx: Pick<Database, 'delete'>, organizationId: string, assetId: string) {
    return tx
      .delete(assetSuppliers)
      .where(
        and(eq(assetSuppliers.organizationId, organizationId), eq(assetSuppliers.assetId, assetId)),
      );
  }

  private rows(organizationId: string, filter?: SQL) {
    return this.db
      .select({
        asset: assets,
        ownerName: users.name,
        technicalOwnerName: technicalUsers.name,
      })
      .from(assets)
      .leftJoin(members, eq(members.id, assets.ownerId))
      .leftJoin(users, eq(users.id, members.userId))
      .leftJoin(technicalMembers, eq(technicalMembers.id, assets.technicalOwnerId))
      .leftJoin(technicalUsers, eq(technicalUsers.id, technicalMembers.userId))
      .where(and(eq(assets.organizationId, organizationId), isNull(assets.deletedAt), filter));
  }

  private async find(organizationId: string, id: string) {
    const rows = await this.rows(organizationId);
    const row = rows.find(({ asset }) => asset.id === id);
    if (!row) throw new NotFoundException('This asset does not exist.');
    return row;
  }
}
