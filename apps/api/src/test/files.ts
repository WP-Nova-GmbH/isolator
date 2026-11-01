import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from '../db/db.module';
import { FilesService } from '../files/files.service';
import { createFileStorages } from '../files/storage-config';

/** A FilesService on a throwaway directory. */
export function testFiles(db: Database) {
  const directory = join(tmpdir(), `isolator-test-${randomUUID()}`);
  const storages = createFileStorages({ STORAGE_DIR: directory });
  return { files: new FilesService(db, storages, null), storages, directory };
}
