import { createClerkClient, verifyToken } from '@clerk/backend';
import { ForbiddenException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { sessions, users } from '../db/schema';

export interface AuthSession {
  id: string;
  clerkUserId: string;
}

export interface Person {
  clerkUserId: string;
  name: string | null;
  /** Their primary address, and only once Clerk has verified it. */
  email: string | null;
}

/** What Isolator asks of Clerk. */
export interface Auth {
  session(authorization: string | undefined): Promise<AuthSession | null>;
  person(clerkUserId: string): Promise<Person>;
}

/** Keys come from the environment. CLERK_JWT_KEY is optional and saves fetching Clerk's keys. */
export function createAuth(env: NodeJS.ProcessEnv = process.env): Auth {
  const { CLERK_SECRET_KEY: secretKey, CLERK_PUBLISHABLE_KEY: publishableKey } = env;
  if (!secretKey || !publishableKey) {
    throw new Error('Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.');
  }
  if (!env.APP_URL && env.NODE_ENV === 'production') {
    throw new Error('Set APP_URL to the address people open Isolator at.');
  }
  const authorizedParties = env.APP_URL ? [env.APP_URL] : undefined;
  const clerk = createClerkClient({ secretKey, publishableKey });

  return {
    async session(authorization) {
      const token = authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return null;
      try {
        const { sid, sub } = await verifyToken(token, {
          secretKey,
          jwtKey: env.CLERK_JWT_KEY,
          authorizedParties,
        });
        return { id: sid, clerkUserId: sub };
      } catch {
        return null;
      }
    },

    async person(clerkUserId) {
      const user = await clerk.users.getUser(clerkUserId);
      const email = user.primaryEmailAddress;
      return {
        clerkUserId,
        name: user.fullName,
        email:
          email?.verification?.status === 'verified' ? email.emailAddress.toLowerCase() : null,
      };
    },
  };
}

/**
 * The first request of a Clerk session. Name and email are copied from Clerk here, so a change
 * made in Clerk shows up the next time someone signs in.
 */
export async function startSession(auth: Auth, db: Database, session: AuthSession) {
  const { clerkUserId, name, email } = await auth.person(session.clerkUserId);
  if (!email) throw new ForbiddenException('Verify your email address first.');

  return db.transaction(async (tx) => {
    // Someone added before they had a Clerk account, by a seed or an earlier version of Isolator.
    const [linked] = await tx
      .update(users)
      .set({ clerkUserId, ...(name && { name }) })
      .where(and(eq(users.email, email), isNull(users.clerkUserId)))
      .returning();
    const [user] = linked
      ? [linked]
      : await tx
          .insert(users)
          .values({ clerkUserId, name: name ?? email, email })
          .onConflictDoUpdate({
            target: users.clerkUserId,
            set: { email, ...(name && { name }) },
          })
          .returning();
    await tx.insert(sessions).values({ id: session.id, userId: user.id }).onConflictDoNothing();
    return user;
  });
}
