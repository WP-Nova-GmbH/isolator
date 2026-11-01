import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createAuth, createUser } from '../auth/auth';
import { createDb } from '../db/client';
import { members, organizations, sessions } from '../db/schema';
import { testDatabaseUrl } from '../test/database';
import { MemberGuard, UserGuard, type CurrentMember, type CurrentUser } from './current-member';

const { db, client } = createDb(testDatabaseUrl());
const auth = createAuth(db);
const memberGuard = new MemberGuard(auth, db);
const userGuard = new UserGuard(auth, db);
const password = 'a-long-test-password';

afterAll(() => client.end());

interface TestRequest {
  headers: Record<string, string>;
  member?: CurrentMember;
  user?: CurrentUser;
}

function requestWith(cookie?: string) {
  const request: TestRequest = { headers: cookie ? { cookie } : {} };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

async function addUser(name = 'Someone') {
  const email = `${randomUUID()}@example.com`;
  const user = await createUser(db, { name, email, password });
  return { ...user, email };
}

async function join(userId: string, name = 'Test') {
  const [organization] = await db.insert(organizations).values({ name }).returning();
  const [member] = await db
    .insert(members)
    .values({ organizationId: organization.id, userId })
    .returning();
  return member;
}

async function signIn(email: string) {
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}

describe('MemberGuard', () => {
  it('refuses a request with no session', async () => {
    await expect(memberGuard.canActivate(requestWith().context)).rejects.toThrow('Sign in first.');
  });

  it('refuses a made-up session cookie', async () => {
    const { context } = requestWith('better-auth.session_token=made-up');
    await expect(memberGuard.canActivate(context)).rejects.toThrow('Sign in first.');
  });

  it('refuses a wrong password', async () => {
    const { email } = await addUser();
    await expect(
      auth.api.signInEmail({ body: { email, password: 'not-the-password' } }),
    ).rejects.toThrow('Invalid email or password');
  });

  it('refuses a new account through better-auth itself: there is no public sign-up', async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: 'Mallory', email: `${randomUUID()}@example.com`, password },
      }),
    ).rejects.toThrow();
  });

  it('finds the Member a session belongs to', async () => {
    const user = await addUser();
    const member = await join(user.id);
    const { request, context } = requestWith(await signIn(user.email));
    await memberGuard.canActivate(context);
    expect(request.member).toMatchObject({
      id: member.id,
      organizationId: member.organizationId,
      name: 'Someone',
    });
  });

  it('works in the Organization the session chose', async () => {
    const user = await addUser();
    await join(user.id, 'First');
    const second = await join(user.id, 'Second');
    const cookie = await signIn(user.email);

    const { request, context } = requestWith(cookie);
    await memberGuard.canActivate(context);
    expect(request.member?.organizationName).toBe('First');

    await db
      .update(sessions)
      .set({ activeOrganizationId: second.organizationId })
      .where(eq(sessions.userId, user.id));
    const again = requestWith(cookie);
    await memberGuard.canActivate(again.context);
    expect(again.request.member?.organizationName).toBe('Second');
  });

  it('ignores a chosen Organization its user has been removed from', async () => {
    const user = await addUser();
    const first = await join(user.id, 'First');
    const second = await join(user.id, 'Second');
    await db
      .update(members)
      .set({ removedAt: new Date(), removedReason: 'Left' })
      .where(eq(members.id, second.id));
    const cookie = await signIn(user.email);
    await db
      .update(sessions)
      .set({ activeOrganizationId: second.organizationId })
      .where(eq(sessions.userId, user.id));

    const { request, context } = requestWith(cookie);
    await memberGuard.canActivate(context);
    expect(request.member?.organizationId).toBe(first.organizationId);
  });

  it('refuses someone signed in who belongs to no Organization', async () => {
    const user = await addUser();
    const { context } = requestWith(await signIn(user.email));
    await expect(memberGuard.canActivate(context)).rejects.toThrow('not a Member');
  });
});

describe('UserGuard', () => {
  it('lets through someone with no Organization yet', async () => {
    const user = await addUser();
    const { request, context } = requestWith(await signIn(user.email));
    await userGuard.canActivate(context);
    expect(request.user).toMatchObject({ id: user.id, isOperator: false });
  });

  it('refuses a request with no session', async () => {
    await expect(userGuard.canActivate(requestWith().context)).rejects.toThrow('Sign in first.');
  });
});
