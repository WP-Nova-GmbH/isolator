import { ConflictException } from '@nestjs/common';
import { and, count, isNull, type SQL } from 'drizzle-orm';
import type { Database } from '../db/db.module';
import { tasks } from '../db/schema';

/** Refuses to close a record that still has work on it. Done and cancelled Tasks don't count. */
export async function assertNoOpenTasks(db: Pick<Database, 'select'>, belongsTo: SQL) {
  const [{ open }] = await db
    .select({ open: count() })
    .from(tasks)
    .where(and(belongsTo, isNull(tasks.doneAt), isNull(tasks.cancelledAt)));
  if (open > 0) {
    throw new ConflictException(
      open === 1
        ? 'Finish or cancel its open Task first.'
        : `Finish or cancel its ${open} open Tasks first.`,
    );
  }
}
