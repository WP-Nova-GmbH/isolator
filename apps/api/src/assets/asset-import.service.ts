import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { AuditTrailService } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { suppliers } from '../db/schema';
import { FilesService } from '../files/files.service';
import { toCsv } from '../imports/csv';
import {
  changedColumns,
  choice,
  inTransaction,
  optionalChoice,
  ownerFinder,
  parseRow,
  readTable,
  RowRefused,
  sameText,
  summarize,
  type Column,
  type ImportRow,
} from '../imports/register-import';
import type { CurrentMember } from '../members/current-member';
import { formatSupplierRef } from '../suppliers/supplier-rules';
import { SuppliersService } from '../suppliers/suppliers.service';
import { assetInput, AssetsService, type AssetInput } from './assets.service';

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'type', header: 'Type' },
  { key: 'status', header: 'Status' },
  { key: 'classification', header: 'Classification' },
  { key: 'ownerId', header: 'Business owner' },
  { key: 'technicalOwnerId', header: 'Technical owner' },
  { key: 'suppliers', header: 'Suppliers' },
  { key: 'location', header: 'Locations' },
  { key: 'validation', header: 'Validation' },
  { key: 'source', header: 'Source' },
  { key: 'notes', header: 'Notes' },
] as const satisfies readonly Column<string>[];

type Key = (typeof columns)[number]['key'];

const typeLabels: Record<AssetInput['type'], string> = {
  information: 'Information',
  software: 'Software',
  hardware: 'Hardware',
  service: 'Service',
  people: 'People',
  site: 'Site',
};

const statusLabels: Record<AssetInput['status'], string> = {
  planned: 'Planned',
  operational: 'Operational',
};

const classificationLabels: Record<NonNullable<AssetInput['classification']>, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  strictly_confidential: 'Strictly confidential',
};

const validationLabels: Record<AssetInput['validation'], string> = {
  unvalidated: 'Not validated',
  validated: 'Validated',
};

/** An asset as one row: its form's fields, and the refs of its Suppliers in register order. */
type AssetRecord = AssetInput & { suppliers: string[] };

interface Plan {
  row: ImportRow;
  id?: string;
  before?: AssetRecord;
  after?: AssetRecord;
}

type Listed = Awaited<ReturnType<AssetsService['list']>>[number];

/**
 * The asset register as CSV, and the same file read back: a row with an ID changes that asset,
 * a row without one adds an asset. Nothing is saved until every row can be.
 */
@Injectable()
export class AssetImportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AssetsService) private readonly assets: AssetsService,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  async export(organizationId: string) {
    const assets = await this.assets.list(organizationId);
    return toCsv([
      columns.map((column) => column.header),
      ...assets.map((asset) => [
        asset.id,
        asset.name,
        typeLabels[asset.type],
        statusLabels[asset.status],
        asset.classification ? classificationLabels[asset.classification] : '',
        asset.ownerName ?? '',
        asset.technicalOwnerName ?? '',
        asset.suppliers.map((supplier) => `${supplier.ref} ${supplier.name}`).join('; '),
        asset.location,
        validationLabels[asset.validation],
        asset.source,
        asset.notes,
      ]),
    ]);
  }

  async preview(organizationId: string, file: Buffer) {
    const plans = await this.plan(organizationId, file);
    return summarize(plans.map((plan) => plan.row));
  }

  async apply(member: CurrentMember, file: Buffer) {
    const plans = await this.plan(member.organizationId, file);
    const result = summarize(plans.map((plan) => plan.row));
    if (result.refused > 0) {
      throw new BadRequestException(
        'Some rows are refused. Correct them in the file and import it again.',
      );
    }
    await inTransaction(this.db, async (tx) => {
      const assets = new AssetsService(tx, this.trail);
      const links = new SuppliersService(tx, this.trail, this.files);
      for (const { row, id, before, after } of plans) {
        if (row.action === 'unchanged' || !after) continue;
        const { suppliers: refs, ...input } = after;
        const assetId = id ?? (await assets.create(member, input)).id;
        if (id) await assets.update(member, id, input);
        const had = before?.suppliers ?? [];
        for (const ref of refs.filter((ref) => !had.includes(ref))) {
          await links.linkAsset(member, ref, assetId);
        }
        for (const ref of had.filter((ref) => !refs.includes(ref))) {
          await links.unlinkAsset(member, ref, assetId);
        }
      }
    });
    return result;
  }

  private async plan(organizationId: string, file: Buffer) {
    const table = readTable(file, columns);
    const [current, retired, owner, supplierRefs] = await Promise.all([
      this.assets.list(organizationId),
      this.assets.list(organizationId, 'retired'),
      ownerFinder(this.db, organizationId),
      this.supplierFinder(organizationId),
    ]);
    const seen = new Set<string>();

    return table.map(({ row, cells }): Plan => {
      const existing = cells.id ? current.find((asset) => asset.id === cells.id) : undefined;
      const record = cells.name || existing?.name || 'Unnamed asset';
      try {
        if (cells.id && !existing) {
          throw new RowRefused(
            retired.some((asset) => asset.id === cells.id)
              ? 'This asset is retired. Reinstate it before changing it.'
              : 'No asset in the register has this ID. Leave ID empty to add an asset.',
          );
        }
        if (existing && seen.has(existing.id)) {
          throw new RowRefused('An earlier row changes this asset too.');
        }
        if (existing) seen.add(existing.id);

        const before = existing && this.record(existing);
        // A column the file leaves out keeps the asset's value, or a new asset's default.
        const cell = <T>(key: Key, read: (value: string) => T, keep: () => T) => {
          const value = cells[key];
          return value === undefined ? keep() : read(value);
        };
        const after: AssetRecord = {
          ...parseRow(assetInput, {
            name: cell(
              'name',
              (v) => v,
              () => before?.name ?? '',
            ),
            type: cell(
              'type',
              (v) => choice(v, typeLabels, 'Type'),
              () => before?.type ?? choice('', typeLabels, 'Type'),
            ),
            status: cell(
              'status',
              (v) => (v === '' ? 'operational' : choice(v, statusLabels, 'Status')),
              () => before?.status ?? 'operational',
            ),
            classification: cell(
              'classification',
              (v) => optionalChoice(v, classificationLabels, 'Classification'),
              () => before?.classification ?? null,
            ),
            ownerId: cell(
              'ownerId',
              (v) => owner(v, 'Business owner', before?.ownerId),
              () => before?.ownerId ?? null,
            ),
            technicalOwnerId: cell(
              'technicalOwnerId',
              (v) => owner(v, 'Technical owner', before?.technicalOwnerId),
              () => before?.technicalOwnerId ?? null,
            ),
            location: cell(
              'location',
              (v) => v,
              () => before?.location ?? '',
            ),
            validation: cell(
              'validation',
              (v) => (v === '' ? 'unvalidated' : choice(v, validationLabels, 'Validation')),
              () => before?.validation ?? 'unvalidated',
            ),
            source: cell(
              'source',
              (v) => v,
              () => before?.source ?? '',
            ),
            notes: cell(
              'notes',
              (v) => v,
              () => before?.notes ?? '',
            ),
          }),
          suppliers: cell('suppliers', supplierRefs, () => before?.suppliers ?? []),
        };

        if (!existing || !before) {
          return { row: { row, record: after.name, action: 'add', detail: '' }, after };
        }
        const changes = changedColumns(columns, before, after);
        return {
          row: {
            row,
            record: after.name,
            action: changes.length > 0 ? 'change' : 'unchanged',
            detail: changes.join(', '),
          },
          id: existing.id,
          before,
          after,
        };
      } catch (error) {
        if (!(error instanceof RowRefused)) throw error;
        return { row: { row, record, action: 'refused', detail: error.message } };
      }
    });
  }

  private record(asset: Listed): AssetRecord {
    return {
      name: asset.name,
      type: asset.type,
      status: asset.status,
      classification: asset.classification,
      ownerId: asset.ownerId,
      technicalOwnerId: asset.technicalOwnerId,
      location: asset.location,
      validation: asset.validation,
      source: asset.source,
      notes: asset.notes,
      suppliers: asset.suppliers.map((supplier) => supplier.ref),
    };
  }

  /**
   * Reads the Suppliers column: refs or names separated by semicolons, as the export writes them
   * ("S-01 Microsoft; S-03 Hetzner"). A ref wins over the name after it.
   */
  private async supplierFinder(organizationId: string) {
    const register = await this.db
      .select({ number: suppliers.number, name: suppliers.name, endedAt: suppliers.endedAt })
      .from(suppliers)
      .where(and(eq(suppliers.organizationId, organizationId), isNull(suppliers.deletedAt)));

    return (cell: string) => {
      const numbers = cell
        .split(/[;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const ref = /^S-(\d+)(?:\s|$)/i.exec(item);
          const matches = ref
            ? register.filter((supplier) => supplier.number === Number(ref[1]))
            : register.filter((supplier) => sameText(supplier.name, item));
          if (matches.length === 0) {
            throw new RowRefused(
              ref
                ? `Suppliers: there is no Supplier ${formatSupplierRef(Number(ref[1]))}.`
                : `Suppliers: no Supplier is called “${item}”. Add it to the Supplier register first.`,
            );
          }
          if (matches.length > 1) {
            throw new RowRefused(
              `Suppliers: more than one Supplier is called “${item}”. Use its ref, such as S-03.`,
            );
          }
          const [supplier] = matches;
          if (supplier.endedAt) {
            throw new RowRefused(`Suppliers: ${supplier.name} has ended. Resume it first.`);
          }
          return supplier.number;
        });
      return [...new Set(numbers)].sort((a, b) => a - b).map(formatSupplierRef);
    };
  }
}
