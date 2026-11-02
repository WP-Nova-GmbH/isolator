import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { recordEvent } from '../audit/audit-trail';
import { createUser, passwordInput } from '../auth/auth';
import { DB, type Database } from '../db/db.module';
import { invitations, members, organizations, sessions, users } from '../db/schema';
import type { CurrentMember, CurrentUser } from '../members/current-member';

const VALID_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export const invitationInput = z.object({
  email: z.email('That isn’t an email address.').toLowerCase(),
});

export const newAccountInput = z.object({
  name: z.string().trim().min(1, 'Give your name.'),
  password: passwordInput,
});

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class InvitationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(organizationId: string) {
    return this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        invitedBy: invitations.invitedByName,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(invitations.createdAt));
  }

  /** Inviting someone again replaces their open invitation, so only the newest link works. */
  async create(
    db: Database | Transaction,
    organizationId: string,
    invitedByName: string,
    email: string,
  ) {
    const [existing] = await db
      .select({ id: members.id })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, organizationId),
          eq(users.email, email),
          isNull(members.removedAt),
        ),
      );
    if (existing) throw new ConflictException(`${email} is already a Member.`);

    const token = randomBytes(32).toString('base64url');
    const values = {
      organizationId,
      email,
      invitedByName,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VALID_FOR_MS),
    };
    const [invitation] = await db
      .insert(invitations)
      .values(values)
      .onConflictDoUpdate({
        target: [invitations.organizationId, invitations.email],
        targetWhere: isNull(invitations.acceptedAt),
        set: values,
      })
      .returning({ id: invitations.id });
    return { id: invitation.id, token };
  }

  invite(member: CurrentMember, email: string) {
    return this.db.transaction(async (tx) => {
      const invitation = await this.create(tx, member.organizationId, member.name, email);
      await recordEvent(tx, member, {
        action: 'member.invited',
        recordType: 'member',
        recordId: invitation.id,
        recordLabel: email,
      });
      return invitation;
    });
  }

  async revoke(member: CurrentMember, id: string) {
    await this.db.transaction(async (tx) => {
      const [revoked] = await tx
        .delete(invitations)
        .where(
          and(
            eq(invitations.organizationId, member.organizationId),
            eq(invitations.id, id),
            isNull(invitations.acceptedAt),
          ),
        )
        .returning({ email: invitations.email });
      if (!revoked) throw new NotFoundException('That invitation doesn’t exist.');
      await recordEvent(tx, member, {
        action: 'member.invitation_revoked',
        recordType: 'member',
        recordId: id,
        recordLabel: revoked.email,
      });
    });
  }

  /** What the invitation page shows. Holding the link is what allows it. */
  async find(token: string) {
    const invitation = await this.open(this.db, token);
    const [account] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invitation.email));
    return {
      organizationName: invitation.organizationName,
      invitedBy: invitation.invitedByName,
      email: invitation.email,
      hasAccount: account !== undefined,
    };
  }

  async acceptWithNewAccount(token: string, input: z.infer<typeof newAccountInput>) {
    await this.db.transaction(async (tx) => {
      const invitation = await this.open(tx, token, true);
      const [account] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, invitation.email));
      if (account) throw new ConflictException('You already have an account. Sign in to accept.');
      const user = await createUser(tx, { ...input, email: invitation.email });
      await this.join(tx, invitation, user);
    });
  }

  async accept(token: string, user: CurrentUser) {
    await this.db.transaction(async (tx) => {
      const invitation = await this.open(tx, token, true);
      if (invitation.email !== user.email) {
        throw new ForbiddenException(`This invitation is for ${invitation.email}.`);
      }
      await this.join(tx, invitation, user);
      await tx
        .update(sessions)
        .set({ activeOrganizationId: invitation.organizationId })
        .where(eq(sessions.id, user.sessionId));
    });
  }

  private async open(db: Database | Transaction, token: string, lock = false) {
    const query = db
      .select({
        id: invitations.id,
        organizationId: invitations.organizationId,
        organizationName: organizations.name,
        email: invitations.email,
        invitedByName: invitations.invitedByName,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    const [invitation] = lock ? await query.for('update', { of: invitations }) : await query;
    if (!invitation) throw new NotFoundException('This invitation link no longer works.');
    return invitation;
  }

  /** Someone removed earlier and invited back keeps their Member record and its history. */
  private async join(
    tx: Transaction,
    invitation: Awaited<ReturnType<InvitationsService['open']>>,
    user: { id: string; name: string; email: string },
  ) {
    const { organizationId } = invitation;
    const [member] = await tx
      .insert(members)
      .values({ organizationId, userId: user.id })
      .onConflictDoUpdate({
        target: [members.organizationId, members.userId],
        set: { removedAt: null, removedReason: null },
      })
      .returning({ id: members.id });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(eq(invitations.organizationId, organizationId), eq(invitations.id, invitation.id)),
      );
    await recordEvent(tx, { id: member.id, organizationId, name: user.name }, {
      action: 'member.joined',
      recordType: 'member',
      recordId: member.id,
      recordLabel: user.name,
      after: { email: user.email, invitedBy: invitation.invitedByName },
    });
  }
}
