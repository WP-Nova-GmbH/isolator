import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { nextNumber } from '../db/next-number';
import {
  assets,
  members,
  riskAssets,
  risks,
  storedFiles,
  supplierFiles,
  supplierReviews,
  suppliers,
  tasks,
  users,
} from '../db/schema';
import { FilesService } from '../files/files.service';
import type { CurrentMember } from '../members/current-member';
import { optionalOwnerNameOf, ownerOnReturn } from '../members/owner-name';
import { formatRiskRef } from '../risks/risk-decision';
import { assertNoOpenTasks } from '../tasks/open-tasks';
import { today } from '../validation';
import {
  fileState,
  formatSupplierRef,
  parseSupplierRef,
  supplierAttention,
  supplierState,
} from './supplier-rules';

const isoDate = z.iso.date();

// Null in ownerId, criticality, handlesPersonalData and contractTerm means not known yet.
export const supplierInput = z
  .object({
    name: z.string().trim().min(1, 'Give the Supplier a name.'),
    provides: z.string().trim(),
    ownerId: z.uuid('Choose an owner.').nullable(),
    criticality: z.enum(['low', 'medium', 'high']).nullable(),
    handlesPersonalData: z.boolean().nullable(),
    contact: z.string().trim(),
    contractTerm: z.enum(['fixed', 'rolling']).nullable(),
    contractEnds: isoDate.nullable(),
    exitPlan: z.string().trim(),
    nextReviewOn: z.iso.date('Choose the next review date.'),
  })
  .refine((supplier) => supplier.contractTerm !== 'fixed' || supplier.contractEnds, {
    message: 'Choose when the contract ends.',
  })
  // Only a fixed term has an end date.
  .transform((supplier) => ({
    ...supplier,
    contractEnds: supplier.contractTerm === 'fixed' ? supplier.contractEnds : null,
  }));

export const supplierReviewInput = z
  .object({
    reviewedOn: z.iso.date('Choose the review date.'),
    outcome: z.enum(['no_concerns', 'concerns', 'stop_using']),
    notes: z.string().trim().min(1, 'Say what you checked and what you found.'),
    nextReviewOn: z.iso.date('Choose the next review date.'),
  })
  .refine((review) => review.nextReviewOn > review.reviewedOn, {
    message: 'The next review has to come after this one.',
  });

export const supplierFileInput = z
  .object({
    kind: z.enum([
      'contract',
      'data_processing_agreement',
      'certificate',
      'security_assessment',
      'other',
    ]),
    title: z.string('Name the file, or upload one.').trim().min(1, 'Name the file, or upload one.'),
    location: z.string().trim().nullable(),
    storedFileId: z.uuid().nullable(),
    // Null when the date on the paperwork isn't known.
    datedOn: isoDate.nullable(),
    expiresOn: isoDate.nullable(),
  })
  .refine((file) => file.location || file.storedFileId, {
    message: 'Upload the file, or say where it is kept.',
  })
  .refine((file) => !file.expiresOn || !file.datedOn || file.expiresOn > file.datedOn, {
    message: 'It can’t expire before it is dated.',
  });

export type SupplierInput = z.output<typeof supplierInput>;
export type SupplierReviewInput = z.output<typeof supplierReviewInput>;
export type SupplierFileInput = z.output<typeof supplierFileInput>;

type SupplierRow = typeof suppliers.$inferSelect;
type FileRow = typeof supplierFiles.$inferSelect;
type ReviewRow = typeof supplierReviews.$inferSelect;

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  async list(organizationId: string, state: 'active' | 'ended' = 'active') {
    const [rows, files, reviews, assetCounts] = await Promise.all([
      this.rows(
        organizationId,
        state === 'active' ? isNull(suppliers.endedAt) : isNotNull(suppliers.endedAt),
      ),
      this.db.select().from(supplierFiles).where(eq(supplierFiles.organizationId, organizationId)),
      this.reviews(organizationId),
      this.db
        .select({ supplierId: assets.supplierId, total: count() })
        .from(assets)
        .where(
          and(
            eq(assets.organizationId, organizationId),
            isNotNull(assets.supplierId),
            isNull(assets.retiredAt),
            isNull(assets.deletedAt),
          ),
        )
        .groupBy(assets.supplierId),
    ]);
    return rows.map((row) =>
      this.summary(
        row,
        files.filter((file) => file.supplierId === row.supplier.id),
        reviews.filter((review) => review.review.supplierId === row.supplier.id),
        assetCounts.find((asset) => asset.supplierId === row.supplier.id)?.total ?? 0,
      ),
    );
  }

  async get(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    const supplierId = row.supplier.id;
    const [files, reviews, linkedAssets, linkedRisks, history] = await Promise.all([
      this.db
        .select({ file: supplierFiles, stored: storedFiles })
        .from(supplierFiles)
        .leftJoin(storedFiles, eq(storedFiles.id, supplierFiles.storedFileId))
        .where(
          and(
            eq(supplierFiles.organizationId, organizationId),
            eq(supplierFiles.supplierId, supplierId),
          ),
        )
        .orderBy(asc(supplierFiles.kind), sql`${supplierFiles.datedOn} desc nulls last`),
      this.reviews(organizationId, supplierId),
      this.db
        .select({ id: assets.id, name: assets.name })
        .from(assets)
        .where(
          and(
            eq(assets.organizationId, organizationId),
            eq(assets.supplierId, supplierId),
            isNull(assets.retiredAt),
            isNull(assets.deletedAt),
          ),
        )
        .orderBy(asc(assets.name)),
      this.db
        .selectDistinct({
          number: risks.number,
          title: risks.title,
          likelihood: risks.likelihood,
          impact: risks.impact,
          residualLikelihood: risks.residualLikelihood,
          residualImpact: risks.residualImpact,
        })
        .from(riskAssets)
        .innerJoin(assets, eq(assets.id, riskAssets.assetId))
        .innerJoin(risks, eq(risks.id, riskAssets.riskId))
        .where(
          and(
            eq(riskAssets.organizationId, organizationId),
            eq(assets.supplierId, supplierId),
            isNull(risks.closedAt),
            isNull(risks.deletedAt),
          ),
        )
        .orderBy(asc(risks.number)),
      this.trail.forRecord(organizationId, supplierId),
    ]);
    const now = today();
    return {
      ...this.summary(
        row,
        files.map(({ file }) => file),
        reviews,
        linkedAssets.length,
      ),
      files: files.map(({ file, stored }) => ({
        id: file.id,
        kind: file.kind,
        title: file.title,
        location: file.location,
        upload: stored && { id: stored.id, name: stored.name, size: stored.size },
        datedOn: file.datedOn,
        expiresOn: file.expiresOn,
        state: fileState(file.expiresOn, now),
      })),
      reviews: reviews.map(({ review, reviewerName }) => ({
        id: review.id,
        reviewedOn: review.reviewedOn,
        reviewerName,
        outcome: review.outcome,
        notes: review.notes,
        nextReviewOn: review.nextReviewOn,
      })),
      assets: linkedAssets,
      risks: linkedRisks.map(({ number, ...risk }) => ({ ref: formatRiskRef(number), ...risk })),
      history,
    };
  }

  async create(member: CurrentMember, input: SupplierInput) {
    const ownerName = await optionalOwnerNameOf(this.db, member.organizationId, input.ownerId);
    const number = await this.db.transaction(async (tx) => {
      const next = await nextNumber(tx, member.organizationId, suppliers);
      const [supplier] = await tx
        .insert(suppliers)
        .values({ ...input, organizationId: member.organizationId, number: next })
        .returning();
      await recordEvent(tx, member, {
        action: 'supplier.added',
        ...this.record(supplier),
        after: this.snapshot(supplier, ownerName),
      });
      return next;
    });
    return { ref: formatSupplierRef(number) };
  }

  async update(member: CurrentMember, ref: string, input: SupplierInput) {
    const ownerName = await optionalOwnerNameOf(this.db, member.organizationId, input.ownerId);
    const row = await this.findActive(member.organizationId, ref);
    const before = this.snapshot(row.supplier, row.ownerName);
    const after = this.snapshot(input, ownerName);
    if (JSON.stringify(before) === JSON.stringify(after)) return { ref };
    await this.db.transaction(async (tx) => {
      await tx
        .update(suppliers)
        .set(input)
        .where(this.scoped(member.organizationId, row.supplier.id));
      await recordEvent(tx, member, {
        action: 'supplier.changed',
        ...this.record({ ...row.supplier, name: input.name }),
        before,
        after,
      });
    });
    return { ref };
  }

  async end(member: CurrentMember, ref: string, reason: string) {
    const row = await this.findActive(member.organizationId, ref);
    await this.assertNoAssets(member.organizationId, row.supplier.id);
    await assertNoOpenTasks(this.db, member, eq(tasks.supplierId, row.supplier.id));
    await this.db.transaction(async (tx) => {
      await tx
        .update(suppliers)
        .set({ endedAt: new Date(), endedReason: reason })
        .where(this.scoped(member.organizationId, row.supplier.id));
      await recordEvent(tx, member, {
        action: 'supplier.ended',
        ...this.record(row.supplier),
        reason,
      });
    });
    return { ref };
  }

  async resume(member: CurrentMember, ref: string, reason: string) {
    const row = await this.find(member.organizationId, ref);
    if (!row.supplier.endedAt) throw new ConflictException('This Supplier has not ended.');
    const owner = await ownerOnReturn(this.db, member, row.supplier, row.ownerName);
    await this.db.transaction(async (tx) => {
      await tx
        .update(suppliers)
        .set({ endedAt: null, endedReason: null, ownerId: owner.id })
        .where(this.scoped(member.organizationId, row.supplier.id));
      await recordEvent(tx, member, {
        action: 'supplier.resumed',
        ...this.record(row.supplier),
        ...owner.change,
        reason,
      });
    });
    return { ref };
  }

  /** For an entry made by mistake. The record and its trail stay; it leaves the register. */
  async delete(member: CurrentMember, ref: string, reason: string) {
    const row = await this.findActive(member.organizationId, ref);
    const [[{ reviews }], [{ files }]] = await Promise.all([
      this.db
        .select({ reviews: count() })
        .from(supplierReviews)
        .where(
          and(
            eq(supplierReviews.organizationId, member.organizationId),
            eq(supplierReviews.supplierId, row.supplier.id),
          ),
        ),
      this.db
        .select({ files: count() })
        .from(supplierFiles)
        .where(
          and(
            eq(supplierFiles.organizationId, member.organizationId),
            eq(supplierFiles.supplierId, row.supplier.id),
          ),
        ),
    ]);
    if (reviews + files > 0) {
      throw new ConflictException(
        'This Supplier has reviews or files on record, so it stays. End it instead.',
      );
    }
    await this.assertNoAssets(member.organizationId, row.supplier.id);
    await assertNoOpenTasks(this.db, member, eq(tasks.supplierId, row.supplier.id));
    await this.db.transaction(async (tx) => {
      await tx
        .update(suppliers)
        .set({ deletedAt: new Date() })
        .where(this.scoped(member.organizationId, row.supplier.id));
      await recordEvent(tx, member, {
        action: 'supplier.deleted',
        ...this.record(row.supplier),
        before: this.snapshot(row.supplier, row.ownerName),
        reason,
      });
    });
  }

  async addReview(member: CurrentMember, ref: string, input: SupplierReviewInput) {
    if (input.reviewedOn > today()) {
      throw new BadRequestException('Record a review once it has happened.');
    }
    const row = await this.findActive(member.organizationId, ref);
    await this.db.transaction(async (tx) => {
      await tx.insert(supplierReviews).values({
        ...input,
        organizationId: member.organizationId,
        supplierId: row.supplier.id,
        reviewerId: member.id,
      });
      await tx
        .update(suppliers)
        .set({ nextReviewOn: input.nextReviewOn })
        .where(this.scoped(member.organizationId, row.supplier.id));
      await recordEvent(tx, member, {
        action: 'supplier.reviewed',
        ...this.record(row.supplier),
        after: input,
      });
    });
  }

  async addFile(member: CurrentMember, ref: string, input: SupplierFileInput) {
    const row = await this.findActive(member.organizationId, ref);
    const stored = input.storedFileId
      ? await this.files.find(member.organizationId, input.storedFileId)
      : null;
    await this.db.transaction(async (tx) => {
      await tx.insert(supplierFiles).values({
        ...input,
        organizationId: member.organizationId,
        supplierId: row.supplier.id,
      });
      await recordEvent(tx, member, {
        action: 'supplier.file_added',
        ...this.record(row.supplier),
        after: this.fileSnapshot(input, stored),
      });
    });
  }

  /** Removes the entry and any uploaded file. The Audit trail keeps its name, size and hash. */
  async removeFile(member: CurrentMember, ref: string, fileId: string) {
    const row = await this.findActive(member.organizationId, ref);
    const stored = await this.db.transaction(async (tx) => {
      const [file] = await tx
        .delete(supplierFiles)
        .where(
          and(
            eq(supplierFiles.organizationId, member.organizationId),
            eq(supplierFiles.supplierId, row.supplier.id),
            eq(supplierFiles.id, fileId),
          ),
        )
        .returning();
      if (!file) throw new NotFoundException('This file does not exist.');
      const upload = file.storedFileId
        ? await this.files.find(member.organizationId, file.storedFileId)
        : null;
      await recordEvent(tx, member, {
        action: 'supplier.file_removed',
        ...this.record(row.supplier),
        before: this.fileSnapshot(file, upload),
      });
      return upload;
    });
    if (stored) await this.files.discard(stored);
  }

  async linkAsset(member: CurrentMember, ref: string, assetId: string) {
    const row = await this.findActive(member.organizationId, ref);
    const [asset] = await this.db
      .select({ name: assets.name, supplierId: assets.supplierId })
      .from(assets)
      .where(
        and(
          eq(assets.organizationId, member.organizationId),
          eq(assets.id, assetId),
          isNull(assets.retiredAt),
          isNull(assets.deletedAt),
        ),
      );
    if (!asset) throw new BadRequestException('Choose an asset from your register.');
    if (asset.supplierId === row.supplier.id) return;
    if (asset.supplierId) throw new ConflictException('Another Supplier provides this asset.');
    await this.db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ supplierId: row.supplier.id })
        .where(and(eq(assets.organizationId, member.organizationId), eq(assets.id, assetId)));
      await recordEvent(tx, member, {
        action: 'supplier.asset_linked',
        ...this.record(row.supplier),
        after: { asset: asset.name },
      });
    });
  }

  async unlinkAsset(member: CurrentMember, ref: string, assetId: string) {
    const row = await this.find(member.organizationId, ref);
    await this.db.transaction(async (tx) => {
      const [asset] = await tx
        .update(assets)
        .set({ supplierId: null })
        .where(
          and(
            eq(assets.organizationId, member.organizationId),
            eq(assets.id, assetId),
            eq(assets.supplierId, row.supplier.id),
          ),
        )
        .returning({ name: assets.name });
      if (!asset) return;
      await recordEvent(tx, member, {
        action: 'supplier.asset_unlinked',
        ...this.record(row.supplier),
        before: { asset: asset.name },
      });
    });
  }

  /** The id behind a ref, for Tasks. An ended Supplier takes no new ones. */
  async activeIdOf(organizationId: string, ref: string) {
    const row = await this.findActive(organizationId, ref);
    return row.supplier.id;
  }

  /** The id behind a ref, ended or not, for reading what is linked to it. */
  async idOf(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    return row.supplier.id;
  }

  private scoped(organizationId: string, supplierId: string) {
    return and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, supplierId));
  }

  private record(supplier: Pick<SupplierRow, 'id' | 'number' | 'name'>) {
    return {
      recordType: 'supplier' as const,
      recordId: supplier.id,
      recordRef: formatSupplierRef(supplier.number),
      recordLabel: supplier.name,
    };
  }

  /** What the Audit trail keeps of a Supplier file, enough to prove which upload it was. */
  private fileSnapshot(
    file: Pick<FileRow, 'kind' | 'title' | 'location' | 'datedOn' | 'expiresOn'>,
    stored: Pick<typeof storedFiles.$inferSelect, 'name' | 'size' | 'sha256'> | null,
  ) {
    const { kind, title, location, datedOn, expiresOn } = file;
    return {
      kind,
      title,
      location,
      datedOn,
      expiresOn,
      upload: stored && { name: stored.name, size: stored.size, sha256: stored.sha256 },
    };
  }

  /** What the Audit trail keeps of a Supplier. */
  private snapshot(supplier: SupplierInput | SupplierRow, ownerName: string | null) {
    return {
      name: supplier.name,
      provides: supplier.provides,
      ownerName,
      criticality: supplier.criticality,
      handlesPersonalData: supplier.handlesPersonalData,
      contact: supplier.contact,
      contractTerm: supplier.contractTerm,
      contractEnds: supplier.contractEnds,
      exitPlan: supplier.exitPlan,
      nextReviewOn: supplier.nextReviewOn,
    };
  }

  private rows(organizationId: string, filter?: SQL) {
    return this.db
      .select({ supplier: suppliers, ownerName: users.name })
      .from(suppliers)
      .leftJoin(members, eq(members.id, suppliers.ownerId))
      .leftJoin(users, eq(users.id, members.userId))
      .where(and(eq(suppliers.organizationId, organizationId), isNull(suppliers.deletedAt), filter))
      .orderBy(asc(suppliers.number));
  }

  /** Newest first, with who did each. */
  private reviews(organizationId: string, supplierId?: string) {
    return this.db
      .select({ review: supplierReviews, reviewerName: users.name })
      .from(supplierReviews)
      .innerJoin(members, eq(members.id, supplierReviews.reviewerId))
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(supplierReviews.organizationId, organizationId),
          supplierId ? eq(supplierReviews.supplierId, supplierId) : undefined,
        ),
      )
      .orderBy(desc(supplierReviews.reviewedOn), desc(supplierReviews.createdAt));
  }

  private async find(organizationId: string, ref: string) {
    const number = parseSupplierRef(ref);
    if (number === null) throw new NotFoundException('This Supplier does not exist.');
    const [row] = await this.rows(organizationId, eq(suppliers.number, number));
    if (!row) throw new NotFoundException('This Supplier does not exist.');
    return row;
  }

  private async findActive(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    if (row.supplier.endedAt) throw new ConflictException('Resume this Supplier to change it.');
    return row;
  }

  private summary(
    { supplier, ownerName }: { supplier: SupplierRow; ownerName: string | null },
    files: FileRow[],
    reviews: { review: ReviewRow }[],
    assetCount: number,
  ) {
    const now = today();
    const lastOutcome = reviews[0]?.review.outcome;
    return {
      ref: formatSupplierRef(supplier.number),
      name: supplier.name,
      provides: supplier.provides,
      ownerId: supplier.ownerId,
      ownerName,
      criticality: supplier.criticality,
      handlesPersonalData: supplier.handlesPersonalData,
      contact: supplier.contact,
      contractTerm: supplier.contractTerm,
      contractEnds: supplier.contractEnds,
      exitPlan: supplier.exitPlan,
      nextReviewOn: supplier.nextReviewOn,
      endedAt: supplier.endedAt,
      endedReason: supplier.endedReason,
      assetCount,
      state: supplierState(supplier, lastOutcome, now),
      attention: supplierAttention(supplier, files, lastOutcome, now),
    };
  }

  private async assertNoAssets(organizationId: string, supplierId: string) {
    const [{ linked }] = await this.db
      .select({ linked: count() })
      .from(assets)
      .where(and(eq(assets.organizationId, organizationId), eq(assets.supplierId, supplierId)));
    if (linked > 0) {
      throw new ConflictException(
        linked === 1
          ? 'This Supplier still provides an asset. Remove it first.'
          : `This Supplier still provides ${linked} assets. Remove them first.`,
      );
    }
  }
}
