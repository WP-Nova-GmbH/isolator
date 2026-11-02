import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import {
  controls,
  incidents,
  members,
  nonconformities,
  risks,
  soaEntries,
  suppliers,
  tasks,
  users,
} from '../db/schema';
import { formatIncidentRef, IncidentsService } from '../incidents/incidents.service';
import type { CurrentMember } from '../members/current-member';
import {
  formatNonconformityRef,
  NonconformitiesService,
} from '../nonconformities/nonconformities.service';
import { formatRiskRef } from '../risks/risk-decision';
import { RisksService } from '../risks/risks.service';
import { soaRef, SoaService, soaTitle } from '../soa/soa.service';
import { formatSupplierRef } from '../suppliers/supplier-rules';
import { SuppliersService } from '../suppliers/suppliers.service';
import { today } from '../validation';

export const taskInput = z
  .object({
    title: z.string().trim().min(1, 'Say what needs doing.'),
    ownerId: z.uuid('Choose an owner.'),
    dueOn: z.iso.date('Choose a due date.'),
    riskRef: z.string().optional(),
    supplierRef: z.string().optional(),
    incidentRef: z.string().optional(),
    nonconformityRef: z.string().optional(),
    soaRef: z.string().optional(),
  })
  .refine(
    (task) =>
      [
        task.riskRef,
        task.supplierRef,
        task.incidentRef,
        task.nonconformityRef,
        task.soaRef,
      ].filter(Boolean).length === 1,
    { message: 'Choose what this Task belongs to.' },
  );

export const taskStateInput = z.object({ done: z.boolean() });

export type TaskInput = z.output<typeof taskInput>;

interface BelongsTo {
  risk: typeof risks.$inferSelect | null;
  supplier: typeof suppliers.$inferSelect | null;
  incident: typeof incidents.$inferSelect | null;
  nonconformity: typeof nonconformities.$inferSelect | null;
  entry: typeof soaEntries.$inferSelect | null;
  control: typeof controls.$inferSelect | null;
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(RisksService) private readonly risks: RisksService,
    @Inject(SuppliersService) private readonly suppliers: SuppliersService,
    @Inject(IncidentsService) private readonly incidents: IncidentsService,
    @Inject(NonconformitiesService) private readonly nonconformities: NonconformitiesService,
    @Inject(SoaService) private readonly soa: SoaService,
  ) {}

  async list(
    organizationId: string,
    on: {
      riskRef?: string;
      supplierRef?: string;
      incidentRef?: string;
      nonconformityRef?: string;
      soaRef?: string;
    } = {},
  ) {
    const riskId = on.riskRef ? await this.risks.idOf(organizationId, on.riskRef) : undefined;
    const supplierId = on.supplierRef
      ? await this.suppliers.idOf(organizationId, on.supplierRef)
      : undefined;
    const incidentId = on.incidentRef
      ? await this.incidents.idOf(organizationId, on.incidentRef)
      : undefined;
    const nonconformityId = on.nonconformityRef
      ? await this.nonconformities.idOf(organizationId, on.nonconformityRef)
      : undefined;
    const soaEntryId = on.soaRef
      ? (await this.soa.entry(organizationId, on.soaRef)).entry.id
      : undefined;
    const rows = await this.db
      .select({
        task: tasks,
        ownerName: users.name,
        risk: risks,
        entry: soaEntries,
        control: controls,
        supplier: suppliers,
        incident: incidents,
        nonconformity: nonconformities,
      })
      .from(tasks)
      .innerJoin(members, eq(members.id, tasks.ownerId))
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(risks, eq(risks.id, tasks.riskId))
      .leftJoin(soaEntries, eq(soaEntries.id, tasks.soaEntryId))
      .leftJoin(controls, eq(controls.id, soaEntries.controlId))
      .leftJoin(suppliers, eq(suppliers.id, tasks.supplierId))
      .leftJoin(incidents, eq(incidents.id, tasks.incidentId))
      .leftJoin(nonconformities, eq(nonconformities.id, tasks.nonconformityId))
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          riskId ? eq(tasks.riskId, riskId) : undefined,
          supplierId ? eq(tasks.supplierId, supplierId) : undefined,
          incidentId ? eq(tasks.incidentId, incidentId) : undefined,
          nonconformityId ? eq(tasks.nonconformityId, nonconformityId) : undefined,
          soaEntryId ? eq(tasks.soaEntryId, soaEntryId) : undefined,
          // Tasks of a deleted record leave with it. Deleting needs them finished, so none are lost.
          or(isNull(tasks.riskId), isNull(risks.deletedAt)),
          or(isNull(tasks.supplierId), isNull(suppliers.deletedAt)),
          or(isNull(tasks.incidentId), isNull(incidents.deletedAt)),
          or(isNull(tasks.nonconformityId), isNull(nonconformities.deletedAt)),
        ),
      )
      .orderBy(asc(tasks.dueOn), asc(tasks.createdAt));
    const now = today();
    return rows.map((row) => {
      const { task, ownerName } = row;
      return {
        id: task.id,
        title: task.title,
        ownerId: task.ownerId,
        ownerName,
        dueOn: task.dueOn,
        state: this.state(task, now),
        cancelledReason: task.cancelledReason,
        belongsTo: this.belongsTo(row),
      };
    });
  }

  async create(member: CurrentMember, input: TaskInput) {
    const { organizationId } = member;
    const riskId = input.riskRef
      ? await this.risks.openIdOf(organizationId, input.riskRef)
      : null;
    const supplierId = input.supplierRef
      ? await this.suppliers.activeIdOf(organizationId, input.supplierRef)
      : null;
    const incidentId = input.incidentRef
      ? await this.incidents.openIdOf(organizationId, input.incidentRef)
      : null;
    const nonconformityId = input.nonconformityRef
      ? await this.nonconformities.openIdOf(organizationId, input.nonconformityRef)
      : null;
    const soaEntryId = input.soaRef
      ? (await this.soa.entry(organizationId, input.soaRef)).entry.id
      : null;
    const [owner] = await this.db
      .select({ name: users.name })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.organizationId, organizationId), eq(members.id, input.ownerId)));
    if (!owner) throw new BadRequestException('Choose an owner from your Members.');
    return this.db.transaction(async (tx) => {
      const [task] = await tx
        .insert(tasks)
        .values({
          organizationId,
          title: input.title,
          ownerId: input.ownerId,
          dueOn: input.dueOn,
          riskId,
          supplierId,
          incidentId,
          nonconformityId,
          soaEntryId,
        })
        .returning();
      await recordEvent(tx, member, {
        action: 'task.added',
        recordType: 'task',
        recordId: task.id,
        recordRef:
          input.riskRef ??
          input.supplierRef ??
          input.incidentRef ??
          input.nonconformityRef ??
          input.soaRef,
        recordLabel: task.title,
        after: { ownerName: owner.name, dueOn: task.dueOn },
      });
      return { id: task.id };
    });
  }

  /** For work that is no longer needed. The Task stays on record, with why. */
  async cancel(member: CurrentMember, id: string, reason: string) {
    return this.db.transaction(async (tx) => {
      const [task] = await tx
        .update(tasks)
        .set({ cancelledAt: new Date(), cancelledReason: reason })
        .where(
          and(
            eq(tasks.organizationId, member.organizationId),
            eq(tasks.id, id),
            isNull(tasks.doneAt),
            isNull(tasks.cancelledAt),
          ),
        )
        .returning();
      if (!task) await this.refuse(tx, member.organizationId, id);
      await recordEvent(tx, member, {
        action: 'task.cancelled',
        recordType: 'task',
        recordId: task.id,
        recordLabel: task.title,
        reason,
      });
      return { id: task.id };
    });
  }

  async setDone(member: CurrentMember, id: string, done: boolean) {
    return this.db.transaction(async (tx) => {
      const [task] = await tx
        .update(tasks)
        .set({ doneAt: done ? new Date() : null })
        .where(
          and(
            eq(tasks.organizationId, member.organizationId),
            eq(tasks.id, id),
            isNull(tasks.cancelledAt),
          ),
        )
        .returning();
      if (!task) await this.refuse(tx, member.organizationId, id);
      await recordEvent(tx, member, {
        action: done ? 'task.finished' : 'task.reopened',
        recordType: 'task',
        recordId: task.id,
        recordLabel: task.title,
      });
      return { id: task.id };
    });
  }

  private belongsTo({ risk, supplier, incident, nonconformity, entry, control }: BelongsTo) {
    if (risk) return { kind: 'risk', ref: formatRiskRef(risk.number), title: risk.title };
    if (supplier) {
      return { kind: 'supplier', ref: formatSupplierRef(supplier.number), title: supplier.name };
    }
    if (incident) {
      return { kind: 'incident', ref: formatIncidentRef(incident.number), title: incident.title };
    }
    if (nonconformity) {
      return {
        kind: 'nonconformity',
        ref: formatNonconformityRef(nonconformity.number),
        title: nonconformity.title,
      };
    }
    if (entry) return { kind: 'soa', ref: soaRef(entry, control), title: soaTitle(entry, control) };
    return null;
  }

  private state(task: typeof tasks.$inferSelect, now: string) {
    if (task.cancelledAt) return 'Cancelled';
    if (task.doneAt) return 'Done';
    return task.dueOn < now ? 'Overdue' : 'Open';
  }

  /** Says why an update found nothing to change: the Task is gone, or it is already finished. */
  private async refuse(db: Pick<Database, 'select'>, organizationId: string, id: string): Promise<never> {
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, id)));
    if (!task) throw new NotFoundException('This Task does not exist.');
    throw new ConflictException('This Task is already finished.');
  }
}
