import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { auditEvents } from '../db/schema';
import type { CurrentMember } from '../members/current-member';

export type AuditRecordType =
  | 'risk'
  | 'risk_criteria'
  | 'risk_assessment'
  | 'task'
  | 'supplier'
  | 'asset'
  | 'incident'
  | 'nonconformity'
  | 'file'
  | 'soa_entry'
  | 'document'
  | 'member'
  | 'organization';

export type AuditAction =
  | 'risk.added'
  | 'risk.changed'
  | 'risk.confirmed'
  | 'risk.closed'
  | 'risk.reopened'
  | 'risk.deleted'
  | 'risk.asset_linked'
  | 'risk.asset_unlinked'
  | 'risk.control_linked'
  | 'risk.control_unlinked'
  | 'risk_criteria.changed'
  | 'risk_assessment.started'
  | 'risk_assessment.completed'
  | 'supplier.added'
  | 'supplier.changed'
  | 'supplier.ended'
  | 'supplier.resumed'
  | 'supplier.deleted'
  | 'supplier.reviewed'
  | 'supplier.file_added'
  | 'supplier.file_removed'
  | 'supplier.asset_linked'
  | 'supplier.asset_unlinked'
  | 'asset.added'
  | 'asset.changed'
  | 'asset.retired'
  | 'asset.reinstated'
  | 'asset.deleted'
  | 'file.refused'
  | 'incident.reported'
  | 'incident.changed'
  | 'incident.closed'
  | 'incident.reopened'
  | 'incident.deleted'
  | 'nonconformity.added'
  | 'nonconformity.changed'
  | 'nonconformity.closed'
  | 'nonconformity.reopened'
  | 'nonconformity.deleted'
  | 'soa.own_control_added'
  | 'soa.changed'
  | 'soa.confirmed'
  | 'soa.evidence_added'
  | 'soa.evidence_removed'
  | 'document.added'
  | 'document.changed'
  | 'document.version_started'
  | 'document.confirmed'
  | 'document.withdrawn'
  | 'document.reinstated'
  | 'document.deleted'
  | 'member.invited'
  | 'member.invitation_revoked'
  | 'member.joined'
  | 'member.removed'
  | 'member.role_changed'
  | 'organization.renamed'
  | 'task.added'
  | 'task.committed'
  | 'task.finished'
  | 'task.cancelled';

export type AuditValue = Record<string, unknown>;

interface AuditEntry {
  action: AuditAction;
  recordType: AuditRecordType;
  recordId?: string;
  recordRef?: string;
  recordLabel: string;
  before?: AuditValue | null;
  after?: AuditValue | null;
  reason?: string;
}

const areas: Record<string, AuditRecordType[]> = {
  risks: ['risk', 'risk_criteria', 'risk_assessment'],
  tasks: ['task'],
  suppliers: ['supplier'],
  assets: ['asset'],
  files: ['file'],
  soa: ['soa_entry'],
  documents: ['document'],
  incidents: ['incident'],
  nonconformities: ['nonconformity'],
  members: ['member', 'organization'],
};

/** Adds to the Audit trail. Call it in the transaction that makes the change. */
export async function recordEvent(
  db: Pick<Database, 'insert'>,
  member: Pick<CurrentMember, 'id' | 'organizationId' | 'name'>,
  entry: AuditEntry,
) {
  await db.insert(auditEvents).values({
    ...entry,
    organizationId: member.organizationId,
    memberId: member.id,
    memberName: member.name,
  });
}

export interface TrailPage {
  limit?: number;
  offset?: number;
  q?: string;
}

@Injectable()
export class AuditTrailService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Newest first, one page at a time. Without a limit it returns the whole trail, for exporting.
   * The search matches who did it, the record's ref and name, and the reason given. `total`
   * counts every event that matches, on every page.
   */
  async list(organizationId: string, area?: string, page: TrailPage = {}) {
    const types = area ? areas[area] : undefined;
    const search = page.q?.trim();
    // % and _ in what someone typed mean themselves, not wildcards.
    const pattern = search && `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const filter = and(
      eq(auditEvents.organizationId, organizationId),
      types ? inArray(auditEvents.recordType, types) : undefined,
      pattern
        ? or(
            ilike(auditEvents.memberName, pattern),
            ilike(auditEvents.recordRef, pattern),
            ilike(auditEvents.recordLabel, pattern),
            ilike(auditEvents.reason, pattern),
          )
        : undefined,
    );
    let query = this.db
      .select()
      .from(auditEvents)
      .where(filter)
      .orderBy(desc(auditEvents.sequence))
      .$dynamic();
    if (page.limit) query = query.limit(page.limit);
    if (page.offset) query = query.offset(page.offset);
    const [events, [{ total }]] = await Promise.all([
      query,
      this.db.select({ total: count() }).from(auditEvents).where(filter),
    ]);
    return { events, total };
  }

  /** One record's events, newest first. */
  forRecord(organizationId: string, recordId: string) {
    return this.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organizationId, organizationId), eq(auditEvents.recordId, recordId)))
      .orderBy(desc(auditEvents.sequence));
  }
}
