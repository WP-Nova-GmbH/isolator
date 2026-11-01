import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import type { Database } from '../db/client';
import { accounts, sessions, users, verifications } from '../db/schema';

const MIN_PASSWORD_LENGTH = 12;

export const passwordInput = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(128, 'Use at most 128 characters.');

/** BETTER_AUTH_URL and BETTER_AUTH_SECRET come from the environment. */
export function createAuth(db: Database) {
  return betterAuth({
    basePath: '/api/auth',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    // Accounts only come from claiming an install or accepting an invitation.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    session: {
      additionalFields: {
        activeOrganizationId: { type: 'string', required: false, input: false },
      },
    },
    advanced: { database: { generateId: 'uuid' } },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Adds a person who can sign in, in the transaction that gives them their place. */
export async function createUser(
  tx: Pick<Database, 'insert'>,
  input: { name: string; email: string; password: string; isOperator?: boolean },
) {
  const { password, ...user } = input;
  const [created] = await tx.insert(users).values(user).returning();
  await tx.insert(accounts).values({
    userId: created.id,
    accountId: created.id,
    providerId: 'credential',
    password: await hashPassword(password),
  });
  return created;
}
