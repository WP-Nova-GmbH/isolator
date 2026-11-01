import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { FileStorage } from './file-storage';

/** Files on the server's own disk: development, and self-hosted installs without S3. */
export class LocalFileStorage implements FileStorage {
  readonly driver = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, body: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    // Written beside its final name first, so a crash never leaves half a file in place.
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  }

  async get(key: string): Promise<Readable> {
    // Opened first, so a missing file fails here and not halfway through the response.
    const file = await open(this.path(key));
    return file.createReadStream();
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }

  private path(key: string) {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('File key is outside the storage root');
    return path;
  }
}
