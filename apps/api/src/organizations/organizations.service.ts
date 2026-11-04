import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Database } from '../db/db.module';
import { members, organizations, sessions } from '../db/schema';
import type { CurrentUser } from '../members/current-member';
import { InvitationsService } from './invitations.service';

export const newOrganizationInput = z.object({
  name: z.string().trim().min(1, 'Give the Organization a name.'),
  email: z.email('That isn’t an email address.').toLowerCase(),
});

function requireOperator(user: CurrentUser) {
  if (!user.isOperator) throw new ForbiddenException('Only the Operator can do this.');
}

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly invitations: InvitationsService,
  ) {}

  /** The Operator sees every Organization on the install. Everyone else sees their own. */
  async list(user: CurrentUser) {
    const memberCount = this.db
      .select({ organizationId: members.organizationId, total: count().as('total') })
      .from(members)
      .where(isNull(members.removedAt))
      .groupBy(members.organizationId)
      .as('member_count');
    const own = this.db
      .select({ organizationId: members.organizationId })
      .from(members)
      .where(and(eq(members.userId, user.id), isNull(members.removedAt)))
      .as('own');
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        createdAt: organizations.createdAt,
        members: memberCount.total,
        ownId: own.organizationId,
      })
      .from(organizations)
      .leftJoin(memberCount, eq(memberCount.organizationId, organizations.id))
      .leftJoin(own, eq(own.organizationId, organizations.id))
      .orderBy(asc(organizations.createdAt));
    return rows
      .filter(({ ownId }) => user.isOperator || ownId !== null)
      .map(({ ownId, ...row }) => ({
        ...row,
        members: row.members ?? 0,
        isMember: ownId !== null,
      }));
  }

  /** The Operator doesn't join it: the invitation goes to whoever runs its ISMS. */
  async create(user: CurrentUser, { name, email }: z.infer<typeof newOrganizationInput>) {
    requireOperator(user);
    return this.db.transaction(async (tx) => {
      const [organization] = await tx.insert(organizations).values({ name }).returning();
      // Whoever runs its ISMS administers it.
      const { token } = await this.invitations.create(
        tx,
        organization.id,
        user.name,
        email,
        'administrator',
      );
      return { id: organization.id, token };
    });
  }

  async invite(user: CurrentUser, organizationId: string, email: string) {
    requireOperator(user);
    const [organization] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (!organization) throw new NotFoundException('That Organization doesn’t exist.');
    const { token } = await this.invitations.create(
      this.db,
      organizationId,
      user.name,
      email,
      'administrator',
    );
    return { token };
  }

  async activate(user: CurrentUser, organizationId: string) {
    const [member] = await this.db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.organizationId, organizationId),
          eq(members.userId, user.id),
          isNull(members.removedAt),
        ),
      );
    if (!member) throw new ForbiddenException('You are not a Member of that Organization.');
    await this.db
      .update(sessions)
      .set({ activeOrganizationId: organizationId })
      .where(eq(sessions.id, user.sessionId));
  }
}
