import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, isNotNull, isNull, max, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { members, nonconformities, organizations, tasks, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { assertNoOpenTasks } from '../tasks/open-tasks';
import { today } from '../validation';

export const nonconformityInput = z.object({
  title: z.string().trim().min(1, 'Say what falls short.'),
  description: z.string().trim(),
  foundIn: z.string().trim().min(1, 'Say where it was found.'),
  foundOn: z.iso.date('Choose when it was found.'),
  cause: z.string().trim(),
  ownerId: z.uuid('Choose an owner.'),
});

export type NonconformityInput = z.output<typeof nonconformityInput>;

type NonconformityRow = typeof nonconformities.$inferSelect;

export function formatNonconformityRef(number: number) {
  return `NC-${String(number).padStart(3, '0')}`;
}

export function parseNonconformityRef(ref: string) {
  const match = /^NC-(\d+)$/.exec(ref);
  return match ? Number(match[1]) : null;
}

const closer = alias(members, 'closer');
const closerUser = alias(users, 'closer_user');

@Injectable()
export class NonconformitiesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
  ) {}

  async list(organizationId: string, state?: 'open' | 'closed') {
    const filter =
      state === 'open'
        ? isNull(nonconformities.closedAt)
        : state === 'closed'
          ? isNotNull(nonconformities.closedAt)
          : undefined;
    const rows = await this.rows(organizationId, filter);
    return rows.map((row) => this.summary(row));
  }

  async get(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    const [history, [{ taskCount }]] = await Promise.all([
      this.trail.forRecord(organizationId, row.nonconformity.id),
      this.db
        .select({ taskCount: count() })
        .from(tasks)
        .where(eq(tasks.nonconformityId, row.nonconformity.id)),
    ]);
    return {
      ...this.summary(row),
      description: row.nonconformity.description,
      cause: row.nonconformity.cause,
      // Work was done on it, so it stays on record and can only be closed.
      deletable: taskCount === 0,
      history,
    };
  }

  async add(member: CurrentMember, input: NonconformityInput) {
    const { organizationId } = member;
    this.assertNotInFuture(input.foundOn);
    const ownerName = await this.memberName(organizationId, input.ownerId);
    const number = await this.db.transaction(async (tx) => {
      // Holds the Organization's row so two new records can't take the same number.
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for('update');
      const [{ highest }] = await tx
        .select({ highest: max(nonconformities.number) })
        .from(nonconformities)
        .where(eq(nonconformities.organizationId, organizationId));
      const next = (highest ?? 0) + 1;
      const [nonconformity] = await tx
        .insert(nonconformities)
        .values({ ...input, organizationId, number: next })
        .returning();
      await recordEvent(tx, member, {
        action: 'nonconformity.added',
        ...this.record(nonconformity),
        after: this.snapshot(input, ownerName),
      });
      return next;
    });
    return { ref: formatNonconformityRef(number) };
  }

  async update(member: CurrentMember, ref: string, input: NonconformityInput) {
    const { organizationId } = member;
    this.assertNotInFuture(input.foundOn);
    const ownerName = await this.memberName(organizationId, input.ownerId);
    const row = await this.findOpen(organizationId, ref);
    const before = this.snapshot(row.nonconformity, row.ownerName);
    const after = this.snapshot(input, ownerName);
    if (JSON.stringify(before) === JSON.stringify(after)) return { ref };
    await this.db.transaction(async (tx) => {
      await tx
        .update(nonconformities)
        .set(input)
        .where(this.scoped(organizationId, row.nonconformity.id));
      await recordEvent(tx, member, {
        action: 'nonconformity.changed',
        ...this.record({ ...row.nonconformity, title: input.title }),
        before,
        after,
      });
    });
    return { ref };
  }

  /** The reason is the check that the correction worked, which an auditor will ask to see. */
  async close(member: CurrentMember, ref: string, reason: string) {
    const row = await this.findOpen(member.organizationId, ref);
    if (!row.nonconformity.cause) {
      throw new ConflictException('Save what caused it before closing it.');
    }
    await assertNoOpenTasks(this.db, eq(tasks.nonconformityId, row.nonconformity.id));
    await this.db.transaction(async (tx) => {
      await tx
        .update(nonconformities)
        .set({ closedAt: new Date(), closedById: member.id, closedReason: reason })
        .where(this.scoped(member.organizationId, row.nonconformity.id));
      await recordEvent(tx, member, {
        action: 'nonconformity.closed',
        ...this.record(row.nonconformity),
        reason,
      });
    });
    return { ref };
  }

  async reopen(member: CurrentMember, ref: string, reason: string) {
    const row = await this.find(member.organizationId, ref);
    if (!row.nonconformity.closedAt) {
      throw new ConflictException('This Nonconformity is not closed.');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(nonconformities)
        .set({ closedAt: null, closedById: null, closedReason: null })
        .where(this.scoped(member.organizationId, row.nonconformity.id));
      await recordEvent(tx, member, {
        action: 'nonconformity.reopened',
        ...this.record(row.nonconformity),
        reason,
      });
    });
    return { ref };
  }

  /** For a record made by mistake. The row and its trail stay; it leaves the register. */
  async delete(member: CurrentMember, ref: string, reason: string) {
    const row = await this.find(member.organizationId, ref);
    const [{ taskCount }] = await this.db
      .select({ taskCount: count() })
      .from(tasks)
      .where(eq(tasks.nonconformityId, row.nonconformity.id));
    if (taskCount > 0) {
      throw new ConflictException(
        'This Nonconformity has Tasks on record, so it stays. Close it.',
      );
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(nonconformities)
        .set({ deletedAt: new Date() })
        .where(this.scoped(member.organizationId, row.nonconformity.id));
      await recordEvent(tx, member, {
        action: 'nonconformity.deleted',
        ...this.record(row.nonconformity),
        reason,
      });
    });
  }

  /** The id behind a ref, for Tasks. A closed Nonconformity takes no new ones. */
  async openIdOf(organizationId: string, ref: string) {
    const row = await this.findOpen(organizationId, ref);
    return row.nonconformity.id;
  }

  /** The id behind a ref, closed or not, for reading what is linked to it. */
  async idOf(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    return row.nonconformity.id;
  }

  private assertNotInFuture(foundOn: string) {
    if (foundOn > today()) {
      throw new BadRequestException('A Nonconformity is something already found.');
    }
  }

  private scoped(organizationId: string, id: string) {
    return and(eq(nonconformities.organizationId, organizationId), eq(nonconformities.id, id));
  }

  private record(nonconformity: Pick<NonconformityRow, 'id' | 'number' | 'title'>) {
    return {
      recordType: 'nonconformity' as const,
      recordId: nonconformity.id,
      recordRef: formatNonconformityRef(nonconformity.number),
      recordLabel: nonconformity.title,
    };
  }

  /** What the Audit trail keeps of a Nonconformity. */
  private snapshot(nonconformity: Omit<NonconformityInput, 'ownerId'>, ownerName: string) {
    return {
      title: nonconformity.title,
      description: nonconformity.description,
      foundIn: nonconformity.foundIn,
      foundOn: nonconformity.foundOn,
      cause: nonconformity.cause,
      ownerName,
    };
  }

  private rows(organizationId: string, filter?: SQL) {
    const openTasks = this.db
      .select({ nonconformityId: tasks.nonconformityId, total: count().as('total') })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          isNull(tasks.doneAt),
          isNull(tasks.cancelledAt),
        ),
      )
      .groupBy(tasks.nonconformityId)
      .as('open_tasks');
    return this.db
      .select({
        nonconformity: nonconformities,
        ownerName: users.name,
        closedByName: closerUser.name,
        openTasks: openTasks.total,
      })
      .from(nonconformities)
      .innerJoin(members, eq(members.id, nonconformities.ownerId))
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(closer, eq(closer.id, nonconformities.closedById))
      .leftJoin(closerUser, eq(closerUser.id, closer.userId))
      .leftJoin(openTasks, eq(openTasks.nonconformityId, nonconformities.id))
      .where(
        and(
          eq(nonconformities.organizationId, organizationId),
          isNull(nonconformities.deletedAt),
          filter,
        ),
      )
      .orderBy(desc(nonconformities.foundOn), asc(nonconformities.number));
  }

  private async find(organizationId: string, ref: string) {
    const number = parseNonconformityRef(ref);
    if (number === null) throw new NotFoundException('This Nonconformity does not exist.');
    const [row] = await this.rows(organizationId, eq(nonconformities.number, number));
    if (!row) throw new NotFoundException('This Nonconformity does not exist.');
    return row;
  }

  private async findOpen(organizationId: string, ref: string) {
    const row = await this.find(organizationId, ref);
    if (row.nonconformity.closedAt) {
      throw new ConflictException('Reopen this Nonconformity to change it.');
    }
    return row;
  }

  private summary(row: Awaited<ReturnType<NonconformitiesService['find']>>) {
    const { nonconformity, ownerName, closedByName, openTasks } = row;
    return {
      ref: formatNonconformityRef(nonconformity.number),
      title: nonconformity.title,
      foundIn: nonconformity.foundIn,
      foundOn: nonconformity.foundOn,
      ownerId: nonconformity.ownerId,
      ownerName,
      openTasks: openTasks ?? 0,
      closedAt: nonconformity.closedAt,
      closedBy: closedByName,
      closedReason: nonconformity.closedReason,
      state: nonconformity.closedAt ? 'Closed' : 'Open',
    };
  }

  private async memberName(organizationId: string, memberId: string) {
    const [member] = await this.db
      .select({ name: users.name })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, organizationId),
          eq(members.id, memberId),
          isNull(members.removedAt),
        ),
      );
    if (!member) throw new BadRequestException('Choose an owner from your Members.');
    return member.name;
  }
}
