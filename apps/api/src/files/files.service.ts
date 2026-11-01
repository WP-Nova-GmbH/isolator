import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import { documentVersions, evidence, storedFiles, supplierFiles } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import type { FileStorages } from './storage-config';
import type { VirusScanner } from './virus-scanner';

export const FILE_STORAGES = Symbol('FILE_STORAGES');
export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface Upload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function sha256(body: Buffer) {
  return createHash('sha256').update(body).digest('hex');
}

/** Multipart names arrive as latin1. Path and control characters don't belong in a file name. */
function cleanName(originalName: string) {
  const name = Buffer.from(originalName, 'latin1').toString('utf8');
  return name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(-200) || 'file';
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FILE_STORAGES) private readonly storages: FileStorages,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner | null,
  ) {}

  async store(member: CurrentMember, upload: Upload) {
    if (upload.size === 0) throw new BadRequestException('This file is empty.');
    const name = cleanName(upload.originalname);
    const scannedAt = await this.scan(member, upload, name);
    const id = randomUUID();
    // Only ever built here, so nothing a Member sends can reach a path or another Organization.
    const storageKey = `${member.organizationId}/${id}`;
    const storage = this.storages.active;
    await storage.put(storageKey, upload.buffer, upload.mimetype);
    try {
      const [file] = await this.db
        .insert(storedFiles)
        .values({
          id,
          organizationId: member.organizationId,
          driver: storage.driver,
          storageKey,
          name,
          contentType: upload.mimetype,
          size: upload.size,
          sha256: sha256(upload.buffer),
          scannedAt,
          uploadedById: member.id,
        })
        .returning();
      return this.summary(file);
    } catch (error) {
      await storage.delete(storageKey);
      throw error;
    }
  }

  /** Refuses what the scanner flags, and anything it can't check while scanning is on. */
  private async scan(member: CurrentMember, upload: Upload, name: string) {
    if (!this.scanner) return null;
    const result = await this.scanner.scan(upload.buffer).catch((error: unknown) => {
      this.logger.error('The virus scanner failed', error);
      throw new ServiceUnavailableException(
        'The virus scanner isn’t reachable, so this file wasn’t stored. Try again later.',
      );
    });
    if (result.clean) return new Date();
    await recordEvent(this.db, member, {
      action: 'file.refused',
      recordType: 'file',
      recordLabel: name,
      after: { signature: result.signature, size: upload.size, sha256: sha256(upload.buffer) },
    });
    throw new UnprocessableEntityException(
      `This file wasn’t stored: the virus scanner flagged it as ${result.signature}.`,
    );
  }

  /** A file's details, for a record that wants to link to it. */
  async find(organizationId: string, id: string) {
    const [file] = await this.db
      .select()
      .from(storedFiles)
      .where(and(eq(storedFiles.organizationId, organizationId), eq(storedFiles.id, id)));
    if (!file) throw new NotFoundException('This file does not exist.');
    return file;
  }

  async open(organizationId: string, id: string) {
    const file = await this.find(organizationId, id);
    const stream = await this.storages.of(file.driver).get(file.storageKey);
    return { file, stream };
  }

  /** Removes an upload nothing links to, such as one whose form then failed. */
  async removeUnlinked(organizationId: string, id: string) {
    const file = await this.find(organizationId, id);
    const links = await Promise.all([
      this.db
        .select({ id: supplierFiles.id })
        .from(supplierFiles)
        .where(eq(supplierFiles.storedFileId, id)),
      this.db.select({ id: evidence.id }).from(evidence).where(eq(evidence.storedFileId, id)),
      this.db
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .where(eq(documentVersions.storedFileId, id)),
    ]);
    if (links.some((rows) => rows.length > 0)) {
      throw new ConflictException('This file is in use.');
    }
    await this.discard(file);
  }

  /** Deletes the row and the bytes. The Audit trail keeps the name, size and hash. */
  async discard(file: typeof storedFiles.$inferSelect) {
    await this.db.delete(storedFiles).where(eq(storedFiles.id, file.id));
    try {
      await this.storages.of(file.driver).delete(file.storageKey);
    } catch (error) {
      // The record is already gone. A stray object is untidy, not a reason to fail the Member.
      this.logger.error(`Could not delete ${file.storageKey}`, error);
    }
  }

  private summary(file: typeof storedFiles.$inferSelect) {
    return {
      id: file.id,
      name: file.name,
      contentType: file.contentType,
      size: file.size,
      sha256: file.sha256,
    };
  }
}
