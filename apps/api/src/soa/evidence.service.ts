import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import {
  controls,
  documents,
  evidence,
  members,
  soaEntries,
  storedFiles,
  users,
} from '../db/schema';
import { FilesService } from '../files/files.service';
import type { CurrentMember } from '../members/current-member';
import { fileState } from '../suppliers/supplier-rules';
import { today } from '../validation';
import { SoaService, soaRef, soaTitle } from './soa.service';

export const evidenceInput = z
  .object({
    title: z.string().trim().nullable(),
    location: z.string().trim().nullable(),
    storedFileId: z.uuid().nullable(),
    documentId: z.uuid().nullable(),
    datedOn: z.iso.date('Choose the date of the evidence.'),
    expiresOn: z.iso.date().nullable(),
  })
  .refine((item) => item.location || item.storedFileId || item.documentId, {
    message: 'Upload a file, link a Document, or say where it is kept.',
  })
  .refine((item) => !item.expiresOn || item.expiresOn > item.datedOn, {
    message: 'It can’t expire before it is dated.',
  });

export type EvidenceInput = z.output<typeof evidenceInput>;

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SoaService) private readonly soa: SoaService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  async list(organizationId: string, ref?: string) {
    const entryId = ref ? (await this.soa.entry(organizationId, ref)).entry.id : undefined;
    const rows = await this.db
      .select({
        item: evidence,
        entry: soaEntries,
        control: controls,
        file: storedFiles,
        document: documents,
        addedBy: users.name,
      })
      .from(evidence)
      .innerJoin(soaEntries, eq(soaEntries.id, evidence.soaEntryId))
      .leftJoin(controls, eq(controls.id, soaEntries.controlId))
      .leftJoin(storedFiles, eq(storedFiles.id, evidence.storedFileId))
      .leftJoin(documents, and(eq(documents.id, evidence.documentId), isNull(documents.deletedAt)))
      .innerJoin(members, eq(members.id, evidence.addedById))
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(evidence.organizationId, organizationId),
          entryId ? eq(evidence.soaEntryId, entryId) : undefined,
        ),
      )
      .orderBy(desc(evidence.datedOn), desc(evidence.createdAt));
    const now = today();
    return rows.map(({ item, entry, control, file, document, addedBy }) => ({
      id: item.id,
      ref: soaRef(entry, control),
      controlTitle: soaTitle(entry, control),
      title: item.title,
      kind: document ? 'Document' : 'File',
      location: item.location,
      upload: file && { id: file.id, name: file.name, size: file.size },
      document: document && { id: document.id, title: document.title },
      datedOn: item.datedOn,
      expiresOn: item.expiresOn,
      addedBy,
      state: fileState(item.expiresOn, now),
    }));
  }

  async add(member: CurrentMember, ref: string, input: EvidenceInput) {
    const { organizationId } = member;
    const row = await this.soa.entry(organizationId, ref);
    const stored = input.storedFileId
      ? await this.files.find(organizationId, input.storedFileId)
      : null;
    const document = input.documentId ? await this.document(organizationId, input.documentId) : null;
    const title = input.title || document?.title || stored?.name;
    if (!title) throw new BadRequestException('Name the evidence.');
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .insert(evidence)
        .values({
          organizationId,
          soaEntryId: row.entry.id,
          title,
          location: input.location,
          storedFileId: input.storedFileId,
          documentId: input.documentId,
          datedOn: input.datedOn,
          expiresOn: input.expiresOn,
          addedById: member.id,
        })
        .returning();
      await recordEvent(tx, member, {
        action: 'soa.evidence_added',
        ...this.soa.record(row.entry, row.control),
        after: this.snapshot(item, stored, document),
      });
      return { id: item.id };
    });
  }

  /** Removes the entry and any uploaded file. The Audit trail keeps its name, size and hash. */
  async remove(member: CurrentMember, id: string) {
    const { organizationId } = member;
    const stored = await this.db.transaction(async (tx) => {
      const [item] = await tx
        .delete(evidence)
        .where(and(eq(evidence.organizationId, organizationId), eq(evidence.id, id)))
        .returning();
      if (!item) throw new NotFoundException('This Evidence does not exist.');
      const [row] = await tx
        .select({ entry: soaEntries, control: controls })
        .from(soaEntries)
        .leftJoin(controls, eq(controls.id, soaEntries.controlId))
        .where(eq(soaEntries.id, item.soaEntryId));
      const upload = item.storedFileId
        ? await this.files.find(organizationId, item.storedFileId)
        : null;
      await recordEvent(tx, member, {
        action: 'soa.evidence_removed',
        ...this.soa.record(row.entry, row.control),
        before: this.snapshot(item, upload, null),
      });
      return upload;
    });
    if (stored) await this.files.discard(stored);
  }

  /** What the Audit trail keeps of Evidence, enough to prove which upload it was. */
  private snapshot(
    item: typeof evidence.$inferSelect,
    stored: Pick<typeof storedFiles.$inferSelect, 'name' | 'size' | 'sha256'> | null,
    document: { title: string } | null,
  ) {
    return {
      title: item.title,
      location: item.location,
      document: document?.title ?? null,
      datedOn: item.datedOn,
      expiresOn: item.expiresOn,
      upload: stored && { name: stored.name, size: stored.size, sha256: stored.sha256 },
    };
  }

  private async document(organizationId: string, id: string) {
    const [document] = await this.db
      .select({ title: documents.title })
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, organizationId),
          eq(documents.id, id),
          isNull(documents.deletedAt),
        ),
      );
    if (!document) throw new BadRequestException('Choose a Document from your list.');
    return document;
  }
}
