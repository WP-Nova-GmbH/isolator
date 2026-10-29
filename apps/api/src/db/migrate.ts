import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client';

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!);
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
  console.log('Migrations applied');
}

void main();
