import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client';
import { members, organizations, storedFiles, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { AuditTrailService } from '../audit/audit-trail';
import { FilesService } from './files.service';
import { LocalFileStorage } from './local-file-storage';
import { createFileStorages, createVirusScanner } from './storage-config';
import { ClamAvScanner, parseReply, type VirusScanner } from './virus-scanner';

const { db, client } = createDb(testDatabaseUrl());
const { files, directory } = testFiles(db);

afterAll(async () => {
  await client.end();
  await rm(directory, { recursive: true, force: true });
});

async function member(): Promise<CurrentMember> {
  const [organization] = await db.insert(organizations).values({ name: 'Test' }).returning();
  const [user] = await db
    .insert(users)
    .values({ name: 'Owner', email: `${randomUUID()}@example.com` })
    .returning();
  const [row] = await db
    .insert(members)
    .values({ organizationId: organization.id, userId: user.id })
    .returning();
  return {
    id: row.id,
    organizationId: organization.id,
    organizationName: 'Test',
    name: 'Owner',
    email: user.email,
    role: row.role,
  };
}

const upload = (content = 'hello', originalname = 'contract.pdf') => ({
  originalname,
  mimetype: 'application/pdf',
  size: Buffer.byteLength(content),
  buffer: Buffer.from(content),
});

describe('storing a file', () => {
  it('keeps the bytes and what they were', async () => {
    const owner = await member();
    const stored = await files.store(owner, upload());
    expect(stored).toMatchObject({
      name: 'contract.pdf',
      contentType: 'application/pdf',
      size: 5,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });
    const { file, stream } = await files.open(owner.organizationId, stored.id);
    expect(file.driver).toBe('local');
    expect(await text(stream)).toBe('hello');
  });

  it('refuses an empty file', async () => {
    await expect(files.store(await member(), upload(''))).rejects.toThrow('empty');
  });

  it('files bytes under the Organization, whatever the upload is called', async () => {
    const owner = await member();
    const stored = await files.store(owner, upload('x', '../../etc/passwd'));
    const file = await files.find(owner.organizationId, stored.id);
    expect(file.storageKey).toBe(`${owner.organizationId}/${stored.id}`);
    expect(file.name).toBe('.._.._etc_passwd');
  });

  it('reads umlauts in file names the way multipart sends them', async () => {
    const asSent = Buffer.from('Prüfbericht.pdf', 'utf8').toString('latin1');
    const stored = await files.store(await member(), upload('x', asSent));
    expect(stored.name).toBe('Prüfbericht.pdf');
  });

  it('removes the bytes if the record can’t be saved', async () => {
    const stranger = { ...(await member()), id: randomUUID() };
    await expect(files.store(stranger, upload())).rejects.toThrow();
    const keys = await db
      .select({ key: storedFiles.storageKey })
      .from(storedFiles)
      .where(eq(storedFiles.organizationId, stranger.organizationId));
    expect(keys).toEqual([]);
    expect(existsSync(join(directory, stranger.organizationId))).toBe(true);
  });
});

describe('reading a file', () => {
  it('stays within the Organization', async () => {
    const owner = await member();
    const other = await member();
    const stored = await files.store(owner, upload());
    await expect(files.open(other.organizationId, stored.id)).rejects.toThrow('does not exist');
    await expect(files.removeUnlinked(other.organizationId, stored.id)).rejects.toThrow(
      'does not exist',
    );
  });
});

describe('removing a file', () => {
  it('deletes the bytes and the record', async () => {
    const owner = await member();
    const stored = await files.store(owner, upload());
    await files.removeUnlinked(owner.organizationId, stored.id);
    await expect(files.open(owner.organizationId, stored.id)).rejects.toThrow('does not exist');
    expect(existsSync(join(directory, owner.organizationId, stored.id))).toBe(false);
  });
});

describe('scanning uploads', () => {
  const scanned = (scanner: VirusScanner) =>
    new FilesService(db, createFileStorages({ STORAGE_DIR: directory }), scanner);

  it('stores what the scanner passes, and says it was scanned', async () => {
    const owner = await member();
    const stored = await scanned({ scan: async () => ({ clean: true }) }).store(owner, upload());
    const file = await files.find(owner.organizationId, stored.id);
    expect(file.scannedAt).not.toBeNull();
  });

  it('refuses what it flags, stores nothing, and records it', async () => {
    const owner = await member();
    const infected = scanned({ scan: async () => ({ clean: false, signature: 'Eicar-Test' }) });
    await expect(infected.store(owner, upload('x', 'invoice.pdf'))).rejects.toThrow('Eicar-Test');

    const rows = await db
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.organizationId, owner.organizationId));
    expect(rows).toEqual([]);
    const { events } = await new AuditTrailService(db).list(owner.organizationId);
    expect(events[0]).toMatchObject({
      action: 'file.refused',
      recordLabel: 'invoice.pdf',
      memberName: 'Owner',
      after: { signature: 'Eicar-Test' },
    });
  });

  it('refuses the file when the scanner is unreachable', async () => {
    const down = scanned({ scan: () => Promise.reject(new Error('connection refused')) });
    await expect(down.store(await member(), upload())).rejects.toThrow('isn’t reachable');
  });

  it('is off unless CLAMAV_HOST is set', () => {
    expect(createVirusScanner({})).toBeNull();
    expect(createVirusScanner({ CLAMAV_HOST: 'clamav' })).toBeInstanceOf(ClamAvScanner);
  });

  it('reads clamd’s replies', () => {
    expect(parseReply('stream: OK\0')).toEqual({ clean: true });
    expect(parseReply('stream: Eicar-Signature FOUND\0')).toEqual({
      clean: false,
      signature: 'Eicar-Signature',
    });
    expect(() => parseReply('INSTREAM size limit exceeded. ERROR\0')).toThrow('Unexpected');
    expect(() => parseReply('')).toThrow('Unexpected');
  });
});

describe('ClamAvScanner', () => {
  // A stand-in clamd that keeps to the wire protocol: length-prefixed chunks, then a zero length.
  async function fakeClamd(reply: (content: Buffer) => string) {
    const server = createServer((socket) => {
      let received = Buffer.alloc(0);
      socket.on('data', (data) => {
        received = Buffer.concat([received, Buffer.from(data)]);
        const start = received.indexOf(0) + 1;
        if (received.subarray(0, start).toString() !== 'zINSTREAM\0') return;
        const chunks: Buffer[] = [];
        for (let at = start; at + 4 <= received.length; ) {
          const size = received.readUInt32BE(at);
          if (size === 0) {
            socket.end(reply(Buffer.concat(chunks)));
            return;
          }
          if (at + 4 + size > received.length) return;
          chunks.push(received.subarray(at + 4, at + 4 + size));
          at += 4 + size;
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { server, port: (server.address() as AddressInfo).port };
  }

  it('streams the whole file and passes on the verdict', async () => {
    const body = Buffer.alloc(200 * 1024, 7);
    let seen = 0;
    const { server, port } = await fakeClamd((content) => {
      seen = content.length;
      return 'stream: Test-Signature FOUND\0';
    });
    await expect(new ClamAvScanner('127.0.0.1', port).scan(body)).resolves.toEqual({
      clean: false,
      signature: 'Test-Signature',
    });
    expect(seen).toBe(body.length);
    server.close();
  });

  it('fails when nothing is listening', async () => {
    const { server, port } = await fakeClamd(() => '');
    await new Promise((resolve) => server.close(resolve));
    await expect(new ClamAvScanner('127.0.0.1', port).scan(Buffer.from('x'))).rejects.toThrow();
  });
});

describe('LocalFileStorage', () => {
  it('fails before streaming when the bytes are gone', async () => {
    const storage = new LocalFileStorage(directory);
    await expect(storage.get('missing/file')).rejects.toThrow('ENOENT');
  });

  it('won’t leave its root', async () => {
    const storage = new LocalFileStorage(directory);
    await expect(storage.put('../outside', Buffer.from('x'))).rejects.toThrow('outside');
    await expect(storage.get('../../etc/passwd')).rejects.toThrow('outside');
  });
});

describe('choosing a storage', () => {
  it('uses the local disk unless S3_BUCKET is set', () => {
    expect(createFileStorages({}).active.driver).toBe('local');
    expect(createFileStorages({ S3_BUCKET: 'isolator' }).active.driver).toBe('s3');
  });

  it('still reads local files after moving to S3', () => {
    expect(createFileStorages({ S3_BUCKET: 'isolator' }).of('local').driver).toBe('local');
  });

  it('says so when a file is in S3 but S3 is no longer configured', () => {
    expect(() => createFileStorages({}).of('s3')).toThrow('no S3 settings');
  });
});
