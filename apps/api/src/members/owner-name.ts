import { BadRequestException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/db.module';
import { members, users } from '../db/schema';
import type { CurrentMember } from './current-member';

type Reader = Pick<Database, 'select'>;

async function activeMember(db: Reader, organizationId: string, memberId: string) {
  const [member] = await db
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
  return member;
}

/** The name of the Member chosen to own something. Someone removed can't take on anything new. */
export async function ownerNameOf(db: Reader, organizationId: string, memberId: string) {
  const member = await activeMember(db, organizationId, memberId);
  if (!member) throw new BadRequestException('Choose an owner from your Members.');
  return member.name;
}

/**
 * Who owns a record coming back into use. A closed record keeps the name of an owner who has
 * since left, so whoever brings it back takes it over, and its event shows the change.
 */
export async function ownerOnReturn(
  db: Reader,
  member: CurrentMember,
  { ownerId }: { ownerId: string },
  ownerName: string,
) {
  if (await activeMember(db, member.organizationId, ownerId)) return { id: ownerId, change: {} };
  return {
    id: member.id,
    change: { before: { ownerName }, after: { ownerName: member.name } },
  };
}
