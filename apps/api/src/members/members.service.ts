import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import {
  assets,
  documents,
  incidents,
  members,
  nonconformities,
  organizations,
  risks,
  soaEntries,
  suppliers,
  tasks,
  users,
} from '../db/schema';
import type { CurrentMember } from './current-member';

type OwnedTable =
  | typeof risks
  | typeof assets
  | typeof suppliers
  | typeof incidents
  | typeof nonconformities
  | typeof documents
  | typeof soaEntries
  | typeof tasks;

export const organizationInput = z.object({
  name: z.string().trim().min(1, 'Give the Organization a name.'),
});

@Injectable()
export class MembersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(organizationId: string) {
    const owned = this.db
      .select({ ownerId: risks.ownerId, risksOwned: count().as('risks_owned') })
      .from(risks)
      .where(eq(risks.organizationId, organizationId))
      .groupBy(risks.ownerId)
      .as('owned');
    const rows = await this.db
      .select({
        id: members.id,
        name: users.name,
        email: users.email,
        joinedAt: members.createdAt,
        risksOwned: owned.risksOwned,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .leftJoin(owned, eq(owned.ownerId, members.id))
      .where(and(eq(members.organizationId, organizationId), isNull(members.removedAt)))
      .orderBy(asc(members.createdAt));
    return rows.map((row) => ({ ...row, risksOwned: row.risksOwned ?? 0 }));
  }

  /** Ends someone's access. What they did stays on record under their name. */
  async remove(member: CurrentMember, id: string, reason: string) {
    if (id === member.id) throw new ConflictException('Another Member has to remove you.');
    const [target] = await this.db
      .select({ id: members.id, name: users.name, email: users.email })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, member.organizationId),
          eq(members.id, id),
          isNull(members.removedAt),
        ),
      );
    if (!target) throw new NotFoundException('That Member doesn’t exist.');

    const owned = await this.stillOwned(member.organizationId, id);
    if (owned.length > 0) {
      throw new ConflictException(
        `${target.name} still owns ${owned.join(', ')}. Give them to someone else first.`,
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(members)
        .set({ removedAt: new Date(), removedReason: reason })
        .where(and(eq(members.organizationId, member.organizationId), eq(members.id, id)));
      await recordEvent(tx, member, {
        action: 'member.removed',
        recordType: 'member',
        recordId: id,
        recordLabel: target.name,
        before: { email: target.email },
        reason,
      });
    });
  }

  async rename(member: CurrentMember, name: string) {
    if (name === member.organizationName) return;
    await this.db.transaction(async (tx) => {
      await tx
        .update(organizations)
        .set({ name })
        .where(eq(organizations.id, member.organizationId));
      await recordEvent(tx, member, {
        action: 'organization.renamed',
        recordType: 'organization',
        recordId: member.organizationId,
        recordLabel: name,
        before: { name: member.organizationName },
        after: { name },
      });
    });
  }

  /** What would be left without an owner. Closed records keep the name of who owned them. */
  private async stillOwned(organizationId: string, ownerId: string) {
    const owned = (table: OwnedTable) =>
      and(eq(table.organizationId, organizationId), eq(table.ownerId, ownerId));
    const tally = async (table: OwnedTable, active: SQL | undefined) => {
      const [{ total }] = await this.db
        .select({ total: count() })
        .from(table)
        .where(and(owned(table), active));
      return total;
    };
    const totals = await Promise.all([
      tally(risks, and(isNull(risks.closedAt), isNull(risks.deletedAt))),
      tally(assets, and(isNull(assets.retiredAt), isNull(assets.deletedAt))),
      tally(suppliers, and(isNull(suppliers.endedAt), isNull(suppliers.deletedAt))),
      tally(incidents, and(isNull(incidents.closedAt), isNull(incidents.deletedAt))),
      tally(
        nonconformities,
        and(isNull(nonconformities.closedAt), isNull(nonconformities.deletedAt)),
      ),
      tally(documents, and(isNull(documents.withdrawnAt), isNull(documents.deletedAt))),
      tally(soaEntries, undefined),
      tally(tasks, and(isNull(tasks.doneAt), isNull(tasks.cancelledAt))),
    ]);
    const labels = [
      ['risk', 'risks'],
      ['asset', 'assets'],
      ['Supplier', 'Suppliers'],
      ['Incident', 'Incidents'],
      ['Nonconformity', 'Nonconformities'],
      ['Document', 'Documents'],
      ['SoA entry', 'SoA entries'],
      ['open Task', 'open Tasks'],
    ];
    return totals.flatMap((total, index) =>
      total > 0 ? [`${total} ${labels[index][total === 1 ? 0 : 1]}`] : [],
    );
  }
}
