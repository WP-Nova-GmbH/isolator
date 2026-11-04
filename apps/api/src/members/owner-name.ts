import { BadRequestException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/db.module';
import { members, users } from '../db/schema';
import type { CurrentMember } from './current-member';

type Reader = Pick<Database, 'select'>;

async function activeMember(db: Reader, organizationId: string, memberId: string) {
  const [member] = await db
    .select({ name: users.name, role: members.role })
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

/** Whether a Member can own records: they are still a Member, and not an Auditor. */
export async function canOwn(db: Reader, organizationId: string, memberId: string) {
  const member = await activeMember(db, organizationId, memberId);
  return member !== undefined && member.role !== 'auditor';
}

/**
 * The name of the Member chosen to own something. Someone removed can't take on anything new, and
 * an Auditor only reads.
 */
export async function ownerNameOf(db: Reader, organizationId: string, memberId: string) {
  const member = await activeMember(db, organizationId, memberId);
  if (!member) throw new BadRequestException('Choose an owner from your Members.');
  if (member.role === 'auditor') {
    throw new BadRequestException(`${member.name} is an Auditor, who can’t own anything.`);
  }
  return member.name;
}

/** As ownerNameOf, for records that can stay unassigned. Null means nobody owns it yet. */
export async function optionalOwnerNameOf(
  db: Reader,
  organizationId: string,
  memberId: string | null,
) {
  return memberId ? ownerNameOf(db, organizationId, memberId) : null;
}

interface Return<Id> {
  id: Id;
  change: { before?: { ownerName: string | null }; after?: { ownerName: string } };
}

/**
 * Who owns a record coming back into use. A closed record keeps the name of an owner who has
 * since left or become an Auditor, so whoever brings it back takes it over, and its event shows
 * the change. A record nobody owned stays unassigned.
 */
export async function ownerOnReturn(
  db: Reader,
  member: CurrentMember,
  record: { ownerId: string },
  ownerName: string,
): Promise<Return<string>>;
export async function ownerOnReturn(
  db: Reader,
  member: CurrentMember,
  record: { ownerId: string | null },
  ownerName: string | null,
): Promise<Return<string | null>>;
export async function ownerOnReturn(
  db: Reader,
  member: CurrentMember,
  { ownerId }: { ownerId: string | null },
  ownerName: string | null,
): Promise<Return<string | null>> {
  if (ownerId === null) return { id: null, change: {} };
  if (await canOwn(db, member.organizationId, ownerId)) return { id: ownerId, change: {} };
  return {
    id: member.id,
    change: { before: { ownerName }, after: { ownerName: member.name } },
  };
}
