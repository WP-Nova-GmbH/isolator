import { eq, max } from 'drizzle-orm';
import type { Database } from './db.module';
import { incidents, nonconformities, organizations, risks, soaEntries, suppliers } from './schema';

type Numbered =
  | typeof risks
  | typeof suppliers
  | typeof incidents
  | typeof nonconformities
  | typeof soaEntries;

/** Holds the Organization's row until the transaction ends, so no two records take one number. */
export async function nextNumber(
  tx: Pick<Database, 'select'>,
  organizationId: string,
  table: Numbered,
) {
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for('update');
  const number = 'ownNumber' in table ? table.ownNumber : table.number;
  const [{ highest }] = await tx
    .select({ highest: max(number) })
    .from(table)
    .where(eq(table.organizationId, organizationId));
  return (highest ?? 0) + 1;
}
