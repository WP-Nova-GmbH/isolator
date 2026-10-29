import 'dotenv/config';
import { ANNEX_A_2022, ANNEX_A_2022_FRAMEWORK } from '../controls/annex-a-2022';
import { createDb } from './client';
import { controls } from './schema';

// Idempotent: safe to run after every migration.
async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!);
  await db
    .insert(controls)
    .values(ANNEX_A_2022.map((c) => ({ ...c, framework: ANNEX_A_2022_FRAMEWORK })))
    .onConflictDoNothing({ target: [controls.framework, controls.ref] });
  await client.end();
  console.log(`Seeded ${ANNEX_A_2022.length} ${ANNEX_A_2022_FRAMEWORK} controls`);
}

void main();
