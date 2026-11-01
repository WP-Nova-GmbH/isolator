import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import { accounts, sessions, users } from '../db/schema';

// Isolator sends no email, so whoever runs the server resets a forgotten password:
// npm run auth:reset-password -w api -- someone@example.com
async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error('Say whose password to reset, by email.');

  const { db, client } = createDb(process.env.DATABASE_URL!);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) throw new Error(`Nobody on this install uses ${email}.`);

  const password = randomBytes(18).toString('base64url');
  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ password: await hashPassword(password) })
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });
  await client.end();

  console.log(`New password for ${email}: ${password}`);
  console.log('They should change it under Members and settings after signing in.');
}

void main();
