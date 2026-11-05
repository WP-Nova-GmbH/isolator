import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuditTrailService } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { FilesService } from '../files/files.service';
import { toCsv } from '../imports/csv';
import {
  changedColumns,
  dateCell,
  inTransaction,
  optionalChoice,
  ownerFinder,
  parseRow,
  readTable,
  RowRefused,
  summarize,
  yesNo,
  yesNoLabel,
  type Column,
  type ImportRow,
} from '../imports/register-import';
import type { CurrentMember } from '../members/current-member';
import { formatSupplierRef } from './supplier-rules';
import { supplierInput, SuppliersService, type SupplierInput } from './suppliers.service';

const columns = [
  { key: 'ref', header: 'Ref' },
  { key: 'name', header: 'Name' },
  { key: 'provides', header: 'Provides' },
  { key: 'ownerId', header: 'Owner' },
  { key: 'criticality', header: 'Criticality' },
  { key: 'handlesPersonalData', header: 'Handles personal data' },
  { key: 'contact', header: 'Contact' },
  { key: 'contractTerm', header: 'Contract term' },
  { key: 'contractEnds', header: 'Contract ends' },
  { key: 'exitPlan', header: 'Exit plan' },
  { key: 'nextReviewOn', header: 'Next review' },
] as const satisfies readonly Column<string>[];

type Key = (typeof columns)[number]['key'];

const criticalityLabels: Record<NonNullable<SupplierInput['criticality']>, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const contractTermLabels: Record<NonNullable<SupplierInput['contractTerm']>, string> = {
  fixed: 'Ends on a date',
  rolling: 'Rolls on until notice',
};

interface Plan {
  row: ImportRow;
  ref?: string;
  after?: SupplierInput;
}

type Listed = Awaited<ReturnType<SuppliersService['list']>>[number];

/**
 * The Supplier register as CSV, and the same file read back: a row with a ref changes that
 * Supplier, a row without one adds a Supplier. Nothing is saved until every row can be.
 */
@Injectable()
export class SupplierImportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SuppliersService) private readonly suppliers: SuppliersService,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  async export(organizationId: string) {
    const register = await this.suppliers.list(organizationId);
    return toCsv([
      columns.map((column) => column.header),
      ...register.map((supplier) => [
        supplier.ref,
        supplier.name,
        supplier.provides,
        supplier.ownerName ?? '',
        supplier.criticality ? criticalityLabels[supplier.criticality] : '',
        yesNoLabel(supplier.handlesPersonalData),
        supplier.contact,
        supplier.contractTerm ? contractTermLabels[supplier.contractTerm] : '',
        supplier.contractEnds ?? '',
        supplier.exitPlan,
        supplier.nextReviewOn,
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
      const suppliers = new SuppliersService(tx, this.trail, this.files);
      for (const { row, ref, after } of plans) {
        if (row.action === 'unchanged' || !after) continue;
        if (ref) await suppliers.update(member, ref, after);
        else await suppliers.create(member, after);
      }
    });
    return result;
  }

  private async plan(organizationId: string, file: Buffer) {
    const table = readTable(file, columns);
    const [current, ended, owner] = await Promise.all([
      this.suppliers.list(organizationId),
      this.suppliers.list(organizationId, 'ended'),
      ownerFinder(this.db, organizationId),
    ]);
    const seen = new Set<string>();

    return table.map(({ row, cells }): Plan => {
      const number = /^S-(\d+)$/i.exec(cells.ref ?? '');
      const ref = number ? formatSupplierRef(Number(number[1])) : cells.ref;
      const existing = ref ? current.find((supplier) => supplier.ref === ref) : undefined;
      const record = cells.name || existing?.name || 'Unnamed Supplier';
      try {
        if (ref && !existing) {
          throw new RowRefused(
            ended.some((supplier) => supplier.ref === ref)
              ? 'This Supplier has ended. Resume it before changing it.'
              : 'No Supplier in the register has this ref. Leave Ref empty to add a Supplier.',
          );
        }
        if (existing && seen.has(existing.ref)) {
          throw new RowRefused('An earlier row changes this Supplier too.');
        }
        if (existing) seen.add(existing.ref);

        const before = existing && this.record(existing);
        // A column the file leaves out keeps the Supplier's value, or a new Supplier's default.
        const cell = <T>(key: Key, read: (value: string) => T, keep: () => T) => {
          const value = cells[key];
          return value === undefined ? keep() : read(value);
        };
        const after = parseRow(supplierInput, {
          name: cell(
            'name',
            (v) => v,
            () => before?.name ?? '',
          ),
          provides: cell(
            'provides',
            (v) => v,
            () => before?.provides ?? '',
          ),
          ownerId: cell(
            'ownerId',
            (v) => owner(v, 'Owner', before?.ownerId),
            () => before?.ownerId ?? null,
          ),
          criticality: cell(
            'criticality',
            (v) => optionalChoice(v, criticalityLabels, 'Criticality'),
            () => before?.criticality ?? null,
          ),
          handlesPersonalData: cell(
            'handlesPersonalData',
            (v) => yesNo(v, 'Handles personal data'),
            () => before?.handlesPersonalData ?? null,
          ),
          contact: cell(
            'contact',
            (v) => v,
            () => before?.contact ?? '',
          ),
          contractTerm: cell(
            'contractTerm',
            (v) => optionalChoice(v, contractTermLabels, 'Contract term'),
            () => before?.contractTerm ?? null,
          ),
          contractEnds: cell(
            'contractEnds',
            (v) => dateCell(v, 'Contract ends'),
            () => before?.contractEnds ?? null,
          ),
          exitPlan: cell(
            'exitPlan',
            (v) => v,
            () => before?.exitPlan ?? '',
          ),
          nextReviewOn: cell(
            'nextReviewOn',
            (v) => dateCell(v, 'Next review'),
            () => before?.nextReviewOn ?? null,
          ),
        });

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
          ref: existing.ref,
          after,
        };
      } catch (error) {
        if (!(error instanceof RowRefused)) throw error;
        return { row: { row, record, action: 'refused', detail: error.message } };
      }
    });
  }

  private record(supplier: Listed): SupplierInput {
    return {
      name: supplier.name,
      provides: supplier.provides,
      ownerId: supplier.ownerId,
      criticality: supplier.criticality,
      handlesPersonalData: supplier.handlesPersonalData,
      contact: supplier.contact,
      contractTerm: supplier.contractTerm,
      contractEnds: supplier.contractEnds,
      exitPlan: supplier.exitPlan,
      nextReviewOn: supplier.nextReviewOn,
    };
  }
}
