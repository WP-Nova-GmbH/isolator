import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { assets, members, riskAssets, risks, suppliers, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { ownerNameOf, ownerOnReturn } from '../members/owner-name';
import { formatRiskRef } from '../risks/risk-decision';
import { formatSupplierRef } from '../suppliers/supplier-rules';
import { SuppliersService } from '../suppliers/suppliers.service';

export const assetInput = z.object({
  name: z.string().trim().min(1, 'Give the asset a name.'),
  type: z.enum(['information', 'software', 'hardware', 'service', 'people', 'site']),
  classification: z.enum(['public', 'internal', 'confidential', 'strictly_confidential']),
  ownerId: z.uuid('Choose an owner.'),
  supplierRef: z.string().nullable(),
});

export type AssetInput = z.output<typeof assetInput>;

@Injectable()
export class AssetsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SuppliersService) private readonly suppliers: SuppliersService,
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
    const [rows, counts] = await Promise.all([
      this.rows(
        organizationId,
        state === 'active' ? isNull(assets.retiredAt) : isNotNull(assets.retiredAt),
      ).orderBy(asc(assets.name)),
      this.db.select().from(openRisks),
    ]);
    return rows.map(({ asset, ownerName, supplierNumber, supplierName }) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      classification: asset.classification,
      ownerId: asset.ownerId,
      ownerName,
      retiredAt: asset.retiredAt,
      retiredReason: asset.retiredReason,
      supplier: this.supplier(supplierNumber, supplierName),
      risks: counts.find((count) => count.assetId === asset.id)?.risks ?? 0,
    }));
  }

  async get(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const [linkedRisks, history, [{ everLinked }]] = await Promise.all([
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
    ]);
    return {
      id,
      name: row.asset.name,
      type: row.asset.type,
      classification: row.asset.classification,
      ownerId: row.asset.ownerId,
      ownerName: row.ownerName,
      retiredAt: row.asset.retiredAt,
      retiredReason: row.asset.retiredReason,
      // A risk points at it, even if that risk is closed, so it can only be retired.
      deletable: everLinked === 0,
      supplier: this.supplier(row.supplierNumber, row.supplierName),
      risks: linkedRisks.map((risk) => ({ ref: formatRiskRef(risk.number), title: risk.title })),
      history,
    };
  }

  async create(member: CurrentMember, input: AssetInput) {
    const { organizationId } = member;
    const ownerName = await ownerNameOf(this.db, organizationId, input.ownerId);
    const supplierId = await this.supplierId(organizationId, input.supplierRef);
    return this.db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(assets)
        .values({
          organizationId,
          name: input.name,
          type: input.type,
          classification: input.classification,
          ownerId: input.ownerId,
          supplierId,
        })
        .returning();
      await recordEvent(tx, member, {
        action: 'asset.added',
        recordType: 'asset',
        recordId: asset.id,
        recordLabel: asset.name,
        after: this.snapshot(input, ownerName),
      });
      return { id: asset.id };
    });
  }

  async update(member: CurrentMember, id: string, input: AssetInput) {
    const { organizationId } = member;
    const ownerName = await ownerNameOf(this.db, organizationId, input.ownerId);
    const row = await this.find(organizationId, id);
    if (row.asset.retiredAt) throw new ConflictException('Reinstate this asset to change it.');
    const currentRef =
      row.supplierNumber !== null ? formatSupplierRef(row.supplierNumber) : null;
    const before = this.snapshot({ ...row.asset, supplierRef: currentRef }, row.ownerName);
    const after = this.snapshot(input, ownerName);
    if (JSON.stringify(before) === JSON.stringify(after)) return { id };
    // An unchanged link stays, even to a Supplier that can't take new assets.
    const supplierId =
      input.supplierRef === currentRef
        ? row.asset.supplierId
        : await this.supplierId(organizationId, input.supplierRef);
    await this.db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({
          name: input.name,
          type: input.type,
          classification: input.classification,
          ownerId: input.ownerId,
          supplierId,
        })
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
        .set({ retiredAt: new Date(), retiredReason: reason, supplierId: null })
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, id)));
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
    await this.db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ retiredAt: null, retiredReason: null, ownerId: owner.id })
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, id)));
      await recordEvent(tx, member, {
        action: 'asset.reinstated',
        recordType: 'asset',
        recordId: id,
        recordLabel: row.asset.name,
        ...owner.change,
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
        .set({ deletedAt: new Date(), supplierId: null })
        .where(and(eq(assets.organizationId, organizationId), eq(assets.id, id)));
      await recordEvent(tx, member, {
        action: 'asset.deleted',
        recordType: 'asset',
        recordId: id,
        recordLabel: row.asset.name,
        before: this.snapshot(
          {
            ...row.asset,
            supplierRef:
              row.supplierNumber !== null ? formatSupplierRef(row.supplierNumber) : null,
          },
          row.ownerName,
        ),
        reason,
      });
    });
  }

  /** What the Audit trail keeps of an asset. */
  private snapshot(asset: Omit<AssetInput, 'ownerId'>, ownerName: string) {
    return {
      name: asset.name,
      type: asset.type,
      classification: asset.classification,
      ownerName,
      supplierRef: asset.supplierRef,
    };
  }

  private supplier(number: number | null, name: string | null) {
    return number !== null ? { ref: formatSupplierRef(number), name } : null;
  }

  private rows(organizationId: string, filter?: SQL) {
    return this.db
      .select({
        asset: assets,
        ownerName: users.name,
        supplierNumber: suppliers.number,
        supplierName: suppliers.name,
      })
      .from(assets)
      .innerJoin(members, eq(members.id, assets.ownerId))
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(suppliers, eq(suppliers.id, assets.supplierId))
      .where(and(eq(assets.organizationId, organizationId), isNull(assets.deletedAt), filter));
  }

  private async find(organizationId: string, id: string) {
    const rows = await this.rows(organizationId);
    const row = rows.find(({ asset }) => asset.id === id);
    if (!row) throw new NotFoundException('This asset does not exist.');
    return row;
  }

  private supplierId(organizationId: string, ref: string | null) {
    return ref ? this.suppliers.activeIdOf(organizationId, ref) : null;
  }
}
