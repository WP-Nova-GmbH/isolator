import { Controller, Get, Inject } from '@nestjs/common';
import { DB, type Database } from '../db/db.module';
import { controls } from '../db/schema';

@Controller('controls')
export class ControlsController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async list() {
    const rows = await this.db.select().from(controls);
    // Natural sort so A.5.2 comes before A.5.10.
    return rows.sort(
      (a, b) =>
        a.framework.localeCompare(b.framework) ||
        a.ref.localeCompare(b.ref, undefined, { numeric: true }),
    );
  }
}
