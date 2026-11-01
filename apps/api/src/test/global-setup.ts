import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { ANNEX_A_2022, ANNEX_A_2022_FRAMEWORK } from '../controls/annex-a-2022';
import { createDb } from '../db/client';
import { controls } from '../db/schema';
import { TEST_DATABASE, testDatabaseUrl } from './database';

// Recreates the test database, so every run starts from the migrations.
export async function setup() {
  const admin = postgres(testDatabaseUrl('postgres'), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${TEST_DATABASE} with (force)`);
  await admin.unsafe(`create database ${TEST_DATABASE}`);
  await admin.end();

  const { db, client } = createDb(testDatabaseUrl());
  await migrate(db, { migrationsFolder: './drizzle' });
  await db
    .insert(controls)
    .values(ANNEX_A_2022.map((c) => ({ ...c, framework: ANNEX_A_2022_FRAMEWORK })));
  await client.end();
}
