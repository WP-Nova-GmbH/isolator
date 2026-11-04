import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Auth, AuthSession, Person } from '../auth/auth';
import { createDb } from '../db/client';
import { members, organizations, sessions, users } from '../db/schema';
import { testDatabaseUrl } from '../test/database';
import {
  AllowedFor,
  MemberGuard,
  UserGuard,
  type CurrentMember,
  type CurrentUser,
  type Role,
} from './current-member';

const { db, client } = createDb(testDatabaseUrl());
const signedIn = new Map<string, AuthSession>();
const people = new Map<string, Person>();
const auth: Auth = {
  session: async (authorization) => signedIn.get(authorization ?? '') ?? null,
  person: async (clerkUserId) => people.get(clerkUserId)!,
};
const memberGuard = new MemberGuard(auth, db, new Reflector());
const userGuard = new UserGuard(auth, db);

afterAll(() => client.end());

interface TestRequest {
  method: string;
  headers: { authorization?: string };
  member?: CurrentMember;
  user?: CurrentUser;
}

/** A request to a route. `handler` stands in for the controller method, with its decorators. */
function requestWith(authorization?: string, method = 'GET', handler: () => void = () => {}) {
  const request: TestRequest = { method, headers: { authorization } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { request, context };
}

/** A route method carrying @AllowedFor(...roles). */
function routeFor(...roles: Role[]) {
  const route = () => {};
  AllowedFor(...roles)(route, 'route', { value: route });
  return route;
}

function email() {
  return `${randomUUID()}@example.com`;
}

/** Someone with a Clerk account. Returns a header that signs them in, in a session of its own. */
function signIn(person: Partial<Person> = {}) {
  const clerkUserId = person.clerkUserId ?? randomUUID();
  people.set(clerkUserId, { clerkUserId, name: 'Someone', email: email(), ...person });
  const authorization = `Bearer ${randomUUID()}`;
  signedIn.set(authorization, { id: randomUUID(), clerkUserId });
  return authorization;
}

async function signedInUser(authorization: string) {
  const { request, context } = requestWith(authorization);
  await userGuard.canActivate(context);
  return request.user!;
}

async function join(userId: string, name = 'Test', role: Role = 'editor') {
  const [organization] = await db.insert(organizations).values({ name }).returning();
  const [member] = await db
    .insert(members)
    .values({ organizationId: organization.id, userId, role })
    .returning();
  return member;
}

/** A signed-in Member with a role, and a way to make requests as them. */
async function memberWith(role: Role) {
  const authorization = signIn();
  const user = await signedInUser(authorization);
  await join(user.id, 'Test', role);
  return (method: string, handler?: () => void) =>
    memberGuard.canActivate(requestWith(authorization, method, handler).context);
}

describe('MemberGuard', () => {
  it('refuses a request with no session', async () => {
    await expect(memberGuard.canActivate(requestWith().context)).rejects.toThrow('Sign in first.');
  });

  it('refuses a token Clerk doesn’t vouch for', async () => {
    const { context } = requestWith('Bearer made-up');
    await expect(memberGuard.canActivate(context)).rejects.toThrow('Sign in first.');
  });

  it('finds the Member a session belongs to', async () => {
    const authorization = signIn();
    const user = await signedInUser(authorization);
    const member = await join(user.id);
    const { request, context } = requestWith(authorization);
    await memberGuard.canActivate(context);
    expect(request.member).toMatchObject({
      id: member.id,
      organizationId: member.organizationId,
      name: 'Someone',
    });
  });

  it('works in the Organization the session chose', async () => {
    const authorization = signIn();
    const user = await signedInUser(authorization);
    await join(user.id, 'First');
    const second = await join(user.id, 'Second');

    const { request, context } = requestWith(authorization);
    await memberGuard.canActivate(context);
    expect(request.member?.organizationName).toBe('First');

    await db
      .update(sessions)
      .set({ activeOrganizationId: second.organizationId })
      .where(eq(sessions.id, user.sessionId));
    const again = requestWith(authorization);
    await memberGuard.canActivate(again.context);
    expect(again.request.member?.organizationName).toBe('Second');
  });

  it('keeps a choice to the session that made it', async () => {
    const clerkUserId = randomUUID();
    const first = signIn({ clerkUserId });
    const user = await signedInUser(first);
    await join(user.id, 'First');
    const second = await join(user.id, 'Second');
    await db
      .update(sessions)
      .set({ activeOrganizationId: second.organizationId })
      .where(eq(sessions.id, user.sessionId));

    const { request, context } = requestWith(signIn({ clerkUserId }));
    await memberGuard.canActivate(context);
    expect(request.member?.organizationName).toBe('First');
  });

  it('ignores a chosen Organization its user has been removed from', async () => {
    const authorization = signIn();
    const user = await signedInUser(authorization);
    const first = await join(user.id, 'First');
    const second = await join(user.id, 'Second');
    await db
      .update(members)
      .set({ removedAt: new Date(), removedReason: 'Left' })
      .where(eq(members.id, second.id));
    await db
      .update(sessions)
      .set({ activeOrganizationId: second.organizationId })
      .where(eq(sessions.id, user.sessionId));

    const { request, context } = requestWith(authorization);
    await memberGuard.canActivate(context);
    expect(request.member?.organizationId).toBe(first.organizationId);
  });

  it('refuses someone signed in who belongs to no Organization', async () => {
    const { context } = requestWith(signIn());
    await expect(memberGuard.canActivate(context)).rejects.toThrow('not a Member');
  });
});

describe('roles', () => {
  it('let every Member read', async () => {
    for (const role of ['administrator', 'editor', 'reviewer', 'auditor'] as const) {
      await expect((await memberWith(role))('GET')).resolves.toBe(true);
    }
  });

  it('let Administrators and Editors change records, and nobody else', async () => {
    await expect((await memberWith('administrator'))('POST')).resolves.toBe(true);
    await expect((await memberWith('editor'))('PUT')).resolves.toBe(true);
    await expect((await memberWith('reviewer'))('PUT')).rejects.toThrow(
      'As a Reviewer you can give Confirmations, but not change records.',
    );
    await expect((await memberWith('auditor'))('DELETE')).rejects.toThrow(
      'As an Auditor you can read this ISMS, but not change it.',
    );
  });

  it('let Reviewers give Confirmations, but never Auditors', async () => {
    const confirmation = routeFor('administrator', 'editor', 'reviewer');
    await expect((await memberWith('reviewer'))('POST', confirmation)).resolves.toBe(true);
    await expect((await memberWith('auditor'))('POST', confirmation)).rejects.toThrow('Auditor');
  });

  it('keep managing Members to Administrators', async () => {
    const administration = routeFor('administrator');
    await expect((await memberWith('administrator'))('POST', administration)).resolves.toBe(true);
    await expect((await memberWith('editor'))('POST', administration)).rejects.toThrow(
      'Only an Administrator can do this.',
    );
  });

  it('put the role on the Member', async () => {
    const authorization = signIn();
    const user = await signedInUser(authorization);
    await join(user.id, 'Test', 'reviewer');
    const { request, context } = requestWith(authorization);
    await memberGuard.canActivate(context);
    expect(request.member?.role).toBe('reviewer');
  });
});

describe('UserGuard', () => {
  it('lets through someone with no Organization yet', async () => {
    const address = email();
    const user = await signedInUser(signIn({ email: address }));
    expect(user).toMatchObject({ email: address, isOperator: false });
  });

  it('refuses a request with no session', async () => {
    await expect(userGuard.canActivate(requestWith().context)).rejects.toThrow('Sign in first.');
  });
});

describe('a first sign-in', () => {
  it('finds someone added before they had a Clerk account, by their verified email', async () => {
    const address = email();
    const [added] = await db
      .insert(users)
      .values({ name: 'Added Earlier', email: address })
      .returning();
    const clerkUserId = randomUUID();

    const user = await signedInUser(signIn({ clerkUserId, email: address, name: null }));

    expect(user).toMatchObject({ id: added.id, name: 'Added Earlier' });
    const [row] = await db.select().from(users).where(eq(users.id, added.id));
    expect(row.clerkUserId).toBe(clerkUserId);
  });

  it('refuses an address Clerk hasn’t verified, even if it matches someone', async () => {
    const address = email();
    const [added] = await db.insert(users).values({ name: 'Target', email: address }).returning();
    people.set('unverified', { clerkUserId: 'unverified', name: 'Mallory', email: null });
    const authorization = `Bearer ${randomUUID()}`;
    signedIn.set(authorization, { id: randomUUID(), clerkUserId: 'unverified' });

    await expect(userGuard.canActivate(requestWith(authorization).context)).rejects.toThrow(
      'Verify your email',
    );
    const [row] = await db.select().from(users).where(eq(users.id, added.id));
    expect(row.clerkUserId).toBeNull();
  });

  it('never takes over someone already linked to another Clerk account', async () => {
    const address = email();
    const owner = await signedInUser(signIn({ email: address, name: 'Owner' }));

    const other = await signedInUser(signIn({ email: address, name: 'Other' }));

    expect(other.id).not.toBe(owner.id);
    const [row] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(row.name).toBe('Owner');
  });

  it('uses the email when Clerk has no name', async () => {
    const address = email();
    const user = await signedInUser(signIn({ email: address, name: null }));
    expect(user.name).toBe(address);
  });

  it('picks up a change made in Clerk, the next time someone signs in', async () => {
    const clerkUserId = randomUUID();
    const before = await signedInUser(signIn({ clerkUserId, name: 'Old Name' }));

    const address = email();
    const after = await signedInUser(signIn({ clerkUserId, name: 'New Name', email: address }));

    expect(after).toMatchObject({ id: before.id, name: 'New Name', email: address });
  });

  it('survives several requests arriving at once', async () => {
    const authorization = signIn();
    const results = await Promise.all([1, 2, 3, 4].map(() => signedInUser(authorization)));
    expect(new Set(results.map(({ id }) => id)).size).toBe(1);
  });
});
