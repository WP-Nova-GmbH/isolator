import 'dotenv/config';

const TEST_DATABASE = 'isolator_test';

/** The dev server's Postgres, with a database of its own for tests. Needs `npm run db:up`. */
export function testDatabaseUrl(database = TEST_DATABASE) {
  const url = new URL(
    process.env.DATABASE_URL ?? 'postgres://isolator:isolator@localhost:5440/isolator',
  );
  url.pathname = `/${database}`;
  return url.toString();
}

export { TEST_DATABASE };
