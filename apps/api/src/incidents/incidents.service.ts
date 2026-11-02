import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { nextNumber } from '../db/next-number';
import { incidents, members, risks, tasks, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { ownerNameOf, ownerOnReturn } from '../members/owner-name';
import { formatRiskRef } from '../risks/risk-decision';
import { RisksService } from '../risks/risks.service';
import { assertNoOpenTasks } from '../tasks/open-tasks';
import { today } from '../validation';

export const incidentInput = z.object({
  title: z.string().trim().min(1, 'Say what happened.'),
  description: z.string().trim(),
  occurredOn: z.iso.date('Choose when it happened.'),
  ownerId: z.uuid('Choose an owner.'),
  riskRef: z.string().nullable(),
});

export type IncidentInput = z.output<typeof incidentInput>;

type IncidentRow = typeof incidents.$inferSelect;

export function formatIncidentRef(number: number) {
  return `INC-${String(number).padStart(3, '0')}`;
}

export function parseIncidentRef(ref: string) {
  const match = /^INC-(\d+)$/.exec(ref);
  return match ? Number(match[1]) : null;
}

const closer = alias(members, 'closer');
const closerUser = alias(users, 'closer_user');

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(RisksService) private readonly risks: RisksService,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
  ) {}

  async list(organizationId: string, state?: 'open' | 'closed') {
    const filter =
      state === 'open'
        ? isNull(incidents.closedAt)
        : state === 'closed'
          ? isNotNull(incidents.closedAt)
          : undefined;
    const rows = await this.rows(organizationId, filter);
    return rows.map((row) => this.summary(row));
  }

  async get(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    const [history, taskCount] = await Promise.all([
      this.trail.forRecord(organizationId, row.incident.id),
      this.taskCount(organizationId, row.incident.id),
    ]);
    return {
      ...this.summary(row),
      description: row.incident.description,
      // Work was done on it, so it stays on record and can only be closed.
      deletable: taskCount === 0,
      history,
    };
  }

  async report(member: CurrentMember, input: IncidentInput) {
    const { organizationId } = member;
    this.assertNotInFuture(input.occurredOn);
    const ownerName = await ownerNameOf(this.db, organizationId, input.ownerId);
    const riskId = input.riskRef ? await this.risks.idOf(organizationId, input.riskRef) : null;
    const number = await this.db.transaction(async (tx) => {
      const next = await nextNumber(tx, organizationId, incidents);
      const [incident] = await tx
        .insert(incidents)
        .values({
          organizationId,
          number: next,
          title: input.title,
          description: input.description,
          occurredOn: input.occurredOn,
          ownerId: input.ownerId,
          riskId,
        })
        .returning();
      await recordEvent(tx, member, {
        action: 'incident.reported',
        ...this.record(incident),
        after: this.snapshot(input, ownerName),
      });
      return next;
    });
    return { ref: formatIncidentRef(number) };
  }

  async update(member: CurrentMember, ref: string, input: IncidentInput) {
    const { organizationId } = member;
    this.assertNotInFuture(input.occurredOn);
    const ownerName = await ownerNameOf(this.db, organizationId, input.ownerId);
    const row = await this.findOpen(organizationId, ref);
    const before = this.snapshot(
      { ...row.incident, riskRef: row.risk ? formatRiskRef(row.risk.number) : null },
      row.ownerName,
    );
    const after = this.snapshot(input, ownerName);
    if (JSON.stringify(before) === JSON.stringify(after)) return { ref };
    const riskId = input.riskRef ? await this.risks.idOf(organizationId, input.riskRef) : null;
    await this.db.transaction(async (tx) => {
      await tx
        .update(incidents)
        .set({
          title: input.title,
          description: input.description,
          occurredOn: input.occurredOn,
          ownerId: input.ownerId,
          riskId,
        })
        .where(this.scoped(organizationId, row.incident.id));
      await recordEvent(tx, member, {
        action: 'incident.changed',
        ...this.record({ ...row.incident, title: input.title }),
        before,
        after,
      });
    });
    return { ref };
  }

  async close(member: CurrentMember, ref: string, reason: string) {
    const row = await this.findOpen(member.organizationId, ref);
    await assertNoOpenTasks(this.db, member, eq(tasks.incidentId, row.incident.id));
    await this.db.transaction(async (tx) => {
      await tx
        .update(incidents)
        .set({ closedAt: new Date(), closedById: member.id, closedReason: reason })
        .where(this.scoped(member.organizationId, row.incident.id));
      await recordEvent(tx, member, {
        action: 'incident.closed',
        ...this.record(row.incident),
        reason,
      });
    });
    return { ref };
  }

  async reopen(member: CurrentMember, ref: string, reason: string) {
    const row = await this.find(member.organizationId, ref);
    if (!row.incident.closedAt) throw new ConflictException('This Incident is not closed.');
    const owner = await ownerOnReturn(this.db, member, row.incident, row.ownerName);
    await this.db.transaction(async (tx) => {
      await tx
        .update(incidents)
        .set({ closedAt: null, closedById: null, closedReason: null, ownerId: owner.id })
        .where(this.scoped(member.organizationId, row.incident.id));
      await recordEvent(tx, member, {
        action: 'incident.reopened',
        ...this.record(row.incident),
        ...owner.change,
        reason,
      });
    });
    return { ref };
  }

  /** For a report made by mistake. The record and its trail stay; it leaves the register. */
  async delete(member: CurrentMember, ref: string, reason: string) {
    const row = await this.findOpen(member.organizationId, ref);
    if ((await this.taskCount(member.organizationId, row.incident.id)) > 0) {
      throw new ConflictException('This Incident has Tasks on record, so it stays. Close it.');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(incidents)
        .set({ deletedAt: new Date() })
        .where(this.scoped(member.organizationId, row.incident.id));
      await recordEvent(tx, member, {
        action: 'incident.deleted',
        ...this.record(row.incident),
        reason,
      });
    });
  }

  /** The id behind a ref, for Tasks. A closed Incident takes no new ones. */
  async openIdOf(organizationId: string, ref: string) {
    const row = await this.findOpen(organizationId, ref);
    return row.incident.id;
  }

  /** The id behind a ref, closed or not, for reading what is linked to it. */
  async idOf(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    return row.incident.id;
  }

  private assertNotInFuture(occurredOn: string) {
    if (occurredOn > today()) {
      throw new BadRequestException('An Incident is something that has already happened.');
    }
  }

  private async taskCount(organizationId: string, id: string) {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.incidentId, id)));
    return total;
  }

  private scoped(organizationId: string, incidentId: string) {
    return and(eq(incidents.organizationId, organizationId), eq(incidents.id, incidentId));
  }

  private record(incident: Pick<IncidentRow, 'id' | 'number' | 'title'>) {
    return {
      recordType: 'incident' as const,
      recordId: incident.id,
      recordRef: formatIncidentRef(incident.number),
      recordLabel: incident.title,
    };
  }

  /** What the Audit trail keeps of an Incident. */
  private snapshot(
    incident: Pick<IncidentInput, 'title' | 'description' | 'occurredOn' | 'riskRef'>,
    ownerName: string,
  ) {
    return {
      title: incident.title,
      description: incident.description,
      occurredOn: incident.occurredOn,
      ownerName,
      riskRef: incident.riskRef,
    };
  }

  private rows(organizationId: string, filter?: SQL) {
    return this.db
      .select({
        incident: incidents,
        ownerName: users.name,
        closedByName: closerUser.name,
        risk: risks,
      })
      .from(incidents)
      .innerJoin(members, eq(members.id, incidents.ownerId))
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(closer, eq(closer.id, incidents.closedById))
      .leftJoin(closerUser, eq(closerUser.id, closer.userId))
      .leftJoin(risks, and(eq(risks.id, incidents.riskId), isNull(risks.deletedAt)))
      .where(and(eq(incidents.organizationId, organizationId), isNull(incidents.deletedAt), filter))
      .orderBy(desc(incidents.occurredOn), asc(incidents.number));
  }

  private async find(organizationId: string, ref: string) {
    const number = parseIncidentRef(ref);
    if (number === null) throw new NotFoundException('This Incident does not exist.');
    const [row] = await this.rows(organizationId, eq(incidents.number, number));
    if (!row) throw new NotFoundException('This Incident does not exist.');
    return row;
  }

  private async findOpen(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    if (row.incident.closedAt) throw new ConflictException('Reopen this Incident to change it.');
    return row;
  }

  private summary(row: Awaited<ReturnType<IncidentsService['find']>>) {
    const { incident, ownerName, closedByName, risk } = row;
    return {
      ref: formatIncidentRef(incident.number),
      title: incident.title,
      occurredOn: incident.occurredOn,
      ownerId: incident.ownerId,
      ownerName,
      risk: risk ? { ref: formatRiskRef(risk.number), title: risk.title } : null,
      closedAt: incident.closedAt,
      closedBy: closedByName,
      closedReason: incident.closedReason,
      state: incident.closedAt ? 'Closed' : 'Investigating',
    };
  }
}
