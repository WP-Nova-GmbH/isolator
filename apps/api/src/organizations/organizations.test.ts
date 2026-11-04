import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { invitations, members, organizations, risks, sessions, tasks, users } from '../db/schema';
import type { CurrentMember, CurrentUser } from '../members/current-member';
import { MembersService } from '../members/members.service';
import { ownerNameOf } from '../members/owner-name';
import { testDatabaseUrl } from '../test/database';
import { InstallService } from './install.service';
import { InvitationsService } from './invitations.service';
import { OrganizationsService } from './organizations.service';

const { db, client } = createDb(testDatabaseUrl());
const invitationService = new InvitationsService(db);
const organizationService = new OrganizationsService(db, invitationService);
const memberService = new MembersService(db);
const trail = new AuditTrailService(db);

afterAll(() => client.end());

function email() {
  return `${randomUUID()}@example.com`;
}

async function addUser(name: string) {
  const [created] = await db.insert(users).values({ name, email: email() }).returning();
  return created;
}

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: randomUUID(),
    name: 'Olga Operator',
    email: email(),
    isOperator: true,
    sessionId: randomUUID(),
    activeOrganizationId: null,
    ...overrides,
  };
}

function acceptAs(invited: typeof users.$inferSelect, token: string) {
  const { id, email, name } = invited;
  return invitationService.accept(token, user({ id, email, name }));
}

async function addMember(name: string) {
  const [organization] = await db.insert(organizations).values({ name: 'Test' }).returning();
  const created = await addUser(name);
  const [member] = await db
    .insert(members)
    .values({ organizationId: organization.id, userId: created.id })
    .returning();
  const current: CurrentMember = {
    id: member.id,
    organizationId: organization.id,
    organizationName: organization.name,
    name,
    email: created.email,
    role: member.role,
  };
  return { ...current, userId: created.id };
}

async function addColleague(member: CurrentMember, name: string) {
  const created = await addUser(name);
  const [colleague] = await db
    .insert(members)
    .values({ organizationId: member.organizationId, userId: created.id })
    .returning();
  return { ...colleague, email: created.email };
}

describe('claiming an install', () => {
  // These run in the order written: the install is claimed for good by the last one.
  let install: InstallService;
  let token: string;
  let first: CurrentUser;

  beforeAll(async () => {
    await db.delete(users).where(eq(users.isOperator, true));
    install = new InstallService(db);
    token = (install as unknown as { setupToken: string }).setupToken;
    const created = await addUser('First Person');
    first = user({ id: created.id, email: created.email, isOperator: false });
  });

  it('starts unclaimed', async () => {
    await expect(install.claimed()).resolves.toBe(false);
  });

  it('refuses the wrong setup token', async () => {
    await expect(install.claim(first, { token: 'wrong' })).rejects.toThrow('setup token');
    await expect(install.claimed()).resolves.toBe(false);
  });

  it('makes whoever has the token its Operator', async () => {
    await install.claim(first, { token });
    await expect(install.claimed()).resolves.toBe(true);
    const [operator] = await db.select().from(users).where(eq(users.id, first.id));
    expect(operator.isOperator).toBe(true);
  });

  it('can only happen once, even with the token', async () => {
    const second = await addUser('Second Person');
    await expect(
      install.claim(user({ id: second.id, isOperator: false }), { token }),
    ).rejects.toThrow('already claimed');
  });

  it('allows one Operator, whatever the code does', async () => {
    await expect(
      db.insert(users).values({ name: 'Second', email: email(), isOperator: true }),
    ).rejects.toThrow();
  });
});

describe('Organizations', () => {
  it('only the Operator creates them', async () => {
    await expect(
      organizationService.create(user({ isOperator: false }), { name: 'Nope', email: email() }),
    ).rejects.toThrow('Only the Operator');
  });

  it('come with an invitation for the first Member, not a place for the Operator', async () => {
    const first = email();
    const { id, token } = await organizationService.create(user(), {
      name: 'Example GmbH',
      email: first,
    });
    await expect(invitationService.find(token)).resolves.toEqual({
      organizationName: 'Example GmbH',
      invitedBy: 'Olga Operator',
      email: first,
    });
    const rows = await db.select().from(members).where(eq(members.organizationId, id));
    expect(rows).toHaveLength(0);
  });

  it('are all listed for the Operator, and only your own for anyone else', async () => {
    const member = await addMember('Mia');
    const { id: other } = await organizationService.create(user(), {
      name: 'Other',
      email: email(),
    });

    const own = await organizationService.list(
      user({ id: member.userId, isOperator: false }),
    );
    expect(own.map(({ id }) => id)).toEqual([member.organizationId]);
    expect(own[0]).toMatchObject({ members: 1, isMember: true });

    const all = await organizationService.list(user());
    expect(all.map(({ id }) => id)).toEqual(
      expect.arrayContaining([member.organizationId, other]),
    );
    expect(all.find(({ id }) => id === other)).toMatchObject({ members: 0, isMember: false });
  });

  it('can only be switched to by a Member', async () => {
    const member = await addMember('Mia');
    await expect(organizationService.activate(user(), member.organizationId)).rejects.toThrow(
      'not a Member',
    );
  });
});

describe('invitations', () => {
  it('create a Member, and appear in the Audit trail', async () => {
    const inviter = await addMember('Anna');
    const invited = await addUser('New Person');
    const { token } = await invitationService.invite(inviter, invited.email, 'editor');
    expect(await invitationService.list(inviter.organizationId)).toMatchObject([
      { email: invited.email, invitedBy: 'Anna' },
    ]);

    await acceptAs(invited, token);

    const list = await memberService.list(inviter.organizationId);
    expect(list.map(({ name }) => name)).toEqual(['Anna', 'New Person']);
    expect(await invitationService.list(inviter.organizationId)).toEqual([]);
    const { events } = await trail.list(inviter.organizationId, 'members');
    expect(events.map(({ action }) => action)).toEqual(['member.joined', 'member.invited']);
    expect(events[0].memberName).toBe('New Person');
  });

  it('keep only the hash of the token', async () => {
    const inviter = await addMember('Anna');
    const { id, token } = await invitationService.invite(inviter, email(), 'editor');
    const [row] = await db.select().from(invitations).where(eq(invitations.id, id));
    expect(row.tokenHash).not.toContain(token);
  });

  it('work once', async () => {
    const inviter = await addMember('Anna');
    const invited = await addUser('Once');
    const { token } = await invitationService.invite(inviter, invited.email, 'editor');
    await acceptAs(invited, token);
    await expect(acceptAs(invited, token)).rejects.toThrow('no longer works');
  });

  it('expire', async () => {
    const inviter = await addMember('Anna');
    const { id, token } = await invitationService.invite(inviter, email(), 'editor');
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, id));
    await expect(invitationService.find(token)).rejects.toThrow('no longer works');
    expect(await invitationService.list(inviter.organizationId)).toEqual([]);
  });

  it('stop working once revoked', async () => {
    const inviter = await addMember('Anna');
    const { id, token } = await invitationService.invite(inviter, email(), 'editor');
    await invitationService.revoke(inviter, id);
    await expect(invitationService.find(token)).rejects.toThrow('no longer works');
  });

  it('can’t be revoked from another Organization', async () => {
    const inviter = await addMember('Anna');
    const outsider = await addMember('Mallory');
    const { id, token } = await invitationService.invite(inviter, email(), 'editor');
    await expect(invitationService.revoke(outsider, id)).rejects.toThrow('doesn’t exist');
    await expect(invitationService.find(token)).resolves.toBeDefined();
  });

  it('replace the earlier link when someone is invited again', async () => {
    const inviter = await addMember('Anna');
    const invited = email();
    const first = await invitationService.invite(inviter, invited, 'editor');
    const second = await invitationService.invite(inviter, invited, 'editor');
    await expect(invitationService.find(first.token)).rejects.toThrow('no longer works');
    await expect(invitationService.find(second.token)).resolves.toMatchObject({ email: invited });
    expect(await invitationService.list(inviter.organizationId)).toHaveLength(1);
  });

  it('refuse someone who is already a Member', async () => {
    const inviter = await addMember('Anna');
    await expect(invitationService.invite(inviter, inviter.email, 'editor')).rejects.toThrow(
      'already a Member',
    );
  });

  it('only let in the person invited', async () => {
    const inviter = await addMember('Anna');
    const elsewhere = await addMember('Ben');
    const { token } = await invitationService.invite(inviter, elsewhere.email, 'editor');

    await expect(
      invitationService.accept(token, user({ email: inviter.email })),
    ).rejects.toThrow('This invitation is for');

    await invitationService.accept(
      token,
      user({ id: elsewhere.userId, email: elsewhere.email, name: 'Ben' }),
    );
    const list = await memberService.list(inviter.organizationId);
    expect(list.map(({ name }) => name)).toEqual(['Anna', 'Ben']);
  });

  it('open the Organization in the session that accepts', async () => {
    const inviter = await addMember('Anna');
    const invited = await addUser('New Person');
    const sessionId = randomUUID();
    await db.insert(sessions).values({ id: sessionId, userId: invited.id });
    const { token } = await invitationService.invite(inviter, invited.email, 'editor');

    await invitationService.accept(
      token,
      user({ id: invited.id, email: invited.email, name: invited.name, sessionId }),
    );

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(session.activeOrganizationId).toBe(inviter.organizationId);
  });
});

describe('removing a Member', () => {
  it('ends their access but keeps them on record', async () => {
    const anna = await addMember('Anna');
    const leaver = await addColleague(anna, 'Leaver');
    await memberService.remove(anna, leaver.id, 'Left the company');

    expect((await memberService.list(anna.organizationId)).map(({ name }) => name)).toEqual([
      'Anna',
    ]);
    const [row] = await db.select().from(members).where(eq(members.id, leaver.id));
    expect(row.removedReason).toBe('Left the company');
    const { events } = await trail.list(anna.organizationId, 'members');
    expect(events[0]).toMatchObject({
      action: 'member.removed',
      recordLabel: 'Leaver',
      reason: 'Left the company',
    });
  });

  it('refuses while they still own something, and says what', async () => {
    const anna = await addMember('Anna');
    const leaver = await addColleague(anna, 'Leaver');
    const { organizationId } = anna;
    const [risk] = await db
      .insert(risks)
      .values({
        organizationId,
        number: 1,
        title: 'Theirs',
        description: 'A risk',
        likelihood: 2,
        impact: 2,
        ownerId: leaver.id,
        reviewOn: '2027-01-01',
      })
      .returning();
    await db.insert(tasks).values({
      organizationId,
      title: 'Theirs too',
      ownerId: leaver.id,
      dueOn: '2027-01-01',
      riskId: risk.id,
    });

    await expect(memberService.remove(anna, leaver.id, 'Left')).rejects.toThrow(
      'Leaver still owns 1 risk, 1 open Task.',
    );

    await db.update(risks).set({ closedAt: new Date() }).where(eq(risks.id, risk.id));
    await db.update(tasks).set({ cancelledAt: new Date() }).where(eq(tasks.riskId, risk.id));
    await memberService.remove(anna, leaver.id, 'Left');
  });

  it('can’t be done to yourself', async () => {
    const anna = await addMember('Anna');
    await expect(memberService.remove(anna, anna.id, 'Bored')).rejects.toThrow('Another Member');
  });

  it('can’t reach into another Organization', async () => {
    const anna = await addMember('Anna');
    const outsider = await addMember('Mallory');
    await expect(memberService.remove(outsider, anna.id, 'Mine now')).rejects.toThrow(
      'doesn’t exist',
    );
  });

  it('lets them come back with the same record', async () => {
    const anna = await addMember('Anna');
    const leaver = await addColleague(anna, 'Leaver');
    await memberService.remove(anna, leaver.id, 'Left');
    const { token } = await invitationService.invite(anna, leaver.email, 'editor');
    await invitationService.accept(
      token,
      user({ id: leaver.userId, email: leaver.email, name: 'Leaver' }),
    );

    const rows = await db
      .select()
      .from(members)
      .where(and(eq(members.organizationId, anna.organizationId), eq(members.userId, leaver.userId)));
    expect(rows).toMatchObject([{ id: leaver.id, removedAt: null, removedReason: null }]);
  });
});

describe('renaming the Organization', () => {
  it('is on the Audit trail', async () => {
    const anna = await addMember('Anna');
    await memberService.rename(anna, 'Better Name');
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, anna.organizationId));
    expect(organization.name).toBe('Better Name');
    const { events } = await trail.list(anna.organizationId, 'members');
    expect(events[0]).toMatchObject({
      action: 'organization.renamed',
      before: { name: 'Test' },
      after: { name: 'Better Name' },
    });
  });
});

describe('roles', () => {
  async function administrator(name: string) {
    const member = await addMember(name);
    await db.update(members).set({ role: 'administrator' }).where(eq(members.id, member.id));
    return { ...member, role: 'administrator' as const };
  }

  it('come with the invitation', async () => {
    const anna = await administrator('Anna');
    const invited = await addUser('Reviewer');
    const { token } = await invitationService.invite(anna, invited.email, 'reviewer');
    expect(await invitationService.list(anna.organizationId)).toMatchObject([
      { email: invited.email, role: 'reviewer' },
    ]);
    await acceptAs(invited, token);
    const list = await memberService.list(anna.organizationId);
    expect(list.find((member) => member.name === 'Reviewer')?.role).toBe('reviewer');
  });

  it('make the first Member of a new Organization its Administrator', async () => {
    const operator = await addUser('Operator');
    const invited = await addUser('First');
    const { id, token } = await organizationService.create(
      user({ id: operator.id, email: operator.email }),
      { name: 'New Org', email: invited.email },
    );
    await acceptAs(invited, token);
    expect((await memberService.list(id))[0]).toMatchObject({ name: 'First', role: 'administrator' });
  });

  it('can be changed, and the Audit trail keeps what it was', async () => {
    const anna = await administrator('Anna');
    const colleague = await addColleague(anna, 'Colleague');
    await memberService.changeRole(anna, colleague.id, 'auditor');
    const list = await memberService.list(anna.organizationId);
    expect(list.find((member) => member.id === colleague.id)?.role).toBe('auditor');
    const { events } = await trail.list(anna.organizationId, 'members');
    expect(events[0]).toMatchObject({
      action: 'member.role_changed',
      recordLabel: 'Colleague',
      before: { role: 'editor' },
      after: { role: 'auditor' },
    });
  });

  it('always leave the Organization an Administrator', async () => {
    const anna = await administrator('Anna');
    await expect(memberService.changeRole(anna, anna.id, 'editor')).rejects.toThrow(
      'Anna is the only Administrator.',
    );
    const colleague = await addColleague(anna, 'Colleague');
    await memberService.changeRole(anna, colleague.id, 'administrator');
    await expect(memberService.changeRole(anna, anna.id, 'editor')).resolves.toBeUndefined();
  });

  it('don’t let an Auditor own anything', async () => {
    const anna = await administrator('Anna');
    const colleague = await addColleague(anna, 'Colleague');
    const [risk] = await db
      .insert(risks)
      .values({
        organizationId: anna.organizationId,
        number: 1,
        title: 'Theirs',
        likelihood: 2,
        impact: 2,
        ownerId: colleague.id,
        reviewOn: '2027-01-01',
      })
      .returning();
    await expect(memberService.changeRole(anna, colleague.id, 'auditor')).rejects.toThrow(
      'Colleague still owns 1 risk, and an Auditor can’t own anything.',
    );

    await db.update(risks).set({ ownerId: anna.id }).where(eq(risks.id, risk.id));
    await memberService.changeRole(anna, colleague.id, 'auditor');
    await expect(ownerNameOf(db, anna.organizationId, colleague.id)).rejects.toThrow(
      'Colleague is an Auditor, who can’t own anything.',
    );
  });
});
