import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { AuditTrailService, recordEvent } from '../audit/audit-trail';
import { DB, type Database } from '../db/db.module';
import {
  controls,
  documents,
  documentVersions,
  evidence,
  members,
  soaEntries,
  storedFiles,
  users,
} from '../db/schema';
import { FilesService } from '../files/files.service';
import type { CurrentMember } from '../members/current-member';
import { ownerNameOf, ownerOnReturn } from '../members/owner-name';
import { soaRef, soaTitle } from '../soa/soa.service';

export const documentInput = z.object({
  title: z.string('Give the Document a title.').trim().min(1, 'Give the Document a title.'),
  kind: z.enum([
    'scope',
    'policy',
    'interested_parties',
    'roles',
    'objectives',
    'legal_requirements',
    'competence',
    'awareness',
    'internal_audit',
    'management_review',
  ]),
  ownerId: z.uuid('Choose an owner.'),
  content: z.string(),
});

export const documentFileInput = z.object({ storedFileId: z.uuid().nullable() });

export type DocumentInput = z.output<typeof documentInput>;

type DocumentRow = typeof documents.$inferSelect;
type VersionRow = typeof documentVersions.$inferSelect;

const author = alias(members, 'author');
const authorUser = alias(users, 'author_user');
const confirmer = alias(members, 'confirmer');
const confirmerUser = alias(users, 'confirmer_user');

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditTrailService) private readonly trail: AuditTrailService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  async list(organizationId: string, state: 'active' | 'withdrawn' = 'active') {
    const [rows, versions] = await Promise.all([
      this.rows(
        organizationId,
        state === 'active' ? isNull(documents.withdrawnAt) : isNotNull(documents.withdrawnAt),
      ),
      this.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.organizationId, organizationId))
        .orderBy(desc(documentVersions.version)),
    ]);
    return rows.map((row) =>
      this.summary(
        row,
        versions.filter((version) => version.documentId === row.document.id),
      ),
    );
  }

  async get(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    const [versions, history, usedBy] = await Promise.all([
      this.db
        .select({
          version: documentVersions,
          createdBy: authorUser.name,
          confirmedBy: confirmerUser.name,
          file: storedFiles,
        })
        .from(documentVersions)
        .innerJoin(author, eq(author.id, documentVersions.createdById))
        .innerJoin(authorUser, eq(authorUser.id, author.userId))
        .leftJoin(confirmer, eq(confirmer.id, documentVersions.confirmedById))
        .leftJoin(confirmerUser, eq(confirmerUser.id, confirmer.userId))
        .leftJoin(storedFiles, eq(storedFiles.id, documentVersions.storedFileId))
        .where(this.ofDocument(organizationId, id))
        .orderBy(desc(documentVersions.version)),
      this.trail.forRecord(organizationId, id),
      this.db
        .select({ entry: soaEntries, control: controls })
        .from(evidence)
        .innerJoin(soaEntries, eq(soaEntries.id, evidence.soaEntryId))
        .leftJoin(controls, eq(controls.id, soaEntries.controlId))
        .where(and(eq(evidence.organizationId, organizationId), eq(evidence.documentId, id))),
    ]);
    const latest = versions[0];
    return {
      ...this.summary(
        row,
        versions.map(({ version }) => version),
      ),
      content: latest.version.content,
      upload: latest.file && {
        id: latest.file.id,
        name: latest.file.name,
        size: latest.file.size,
      },
      versions: versions.map(({ version, createdBy, confirmedBy, file }) => ({
        version: version.version,
        createdBy,
        createdAt: version.createdAt,
        confirmedBy,
        confirmedAt: version.confirmedAt,
        upload: file && { id: file.id, name: file.name, size: file.size },
      })),
      usedAsEvidence: usedBy.map(({ entry, control }) => ({
        ref: soaRef(entry, control),
        title: soaTitle(entry, control),
      })),
      // A confirmed version or a link from Evidence puts it on record, so it can only be withdrawn.
      deletable:
        usedBy.length === 0 && versions.every(({ version }) => version.confirmedAt === null),
      history,
    };
  }

  async create(member: CurrentMember, input: DocumentInput) {
    const { organizationId } = member;
    const ownerName = await ownerNameOf(this.db, organizationId, input.ownerId);
    return this.db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          organizationId,
          title: input.title,
          kind: input.kind,
          ownerId: input.ownerId,
        })
        .returning();
      await tx.insert(documentVersions).values({
        organizationId,
        documentId: document.id,
        version: 1,
        content: input.content,
        createdById: member.id,
      });
      await recordEvent(tx, member, {
        action: 'document.added',
        ...this.record(document),
        after: { title: input.title, kind: input.kind, ownerName, version: 1, content: input.content },
      });
      return { id: document.id };
    });
  }

  /** The text can only change on a draft: a confirmed version stays as it was confirmed. */
  async update(member: CurrentMember, id: string, input: DocumentInput) {
    const { organizationId } = member;
    const ownerName = await ownerNameOf(this.db, organizationId, input.ownerId);
    const row = await this.findActive(organizationId, id);
    const latest = await this.latest(organizationId, id);
    if (latest.confirmedAt && input.content !== latest.content) {
      throw new ConflictException('Start a new version to change the content.');
    }
    const before = {
      title: row.document.title,
      kind: row.document.kind,
      ownerName: row.ownerName,
      content: latest.content,
    };
    const after = { title: input.title, kind: input.kind, ownerName, content: input.content };
    if (JSON.stringify(before) === JSON.stringify(after)) return { id };
    await this.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ title: input.title, kind: input.kind, ownerId: input.ownerId })
        .where(this.scoped(organizationId, id));
      if (input.content !== latest.content) {
        await tx
          .update(documentVersions)
          .set({ content: input.content })
          .where(this.scopedVersion(organizationId, latest.id));
      }
      await recordEvent(tx, member, {
        action: 'document.changed',
        ...this.record({ ...row.document, title: input.title }),
        before: { ...before, version: latest.version },
        after: { ...after, version: latest.version },
      });
    });
    return { id };
  }

  /** Attaches an upload to the draft, or clears it. The file it replaces is deleted. */
  async setFile(member: CurrentMember, id: string, storedFileId: string | null) {
    const { organizationId } = member;
    const row = await this.findActive(organizationId, id);
    const latest = await this.latest(organizationId, id);
    if (latest.confirmedAt) throw new ConflictException('Start a new version to change the file.');
    const next = storedFileId ? await this.files.find(organizationId, storedFileId) : null;
    const previous = latest.storedFileId
      ? await this.files.find(organizationId, latest.storedFileId)
      : null;
    const upload = (file: typeof next) =>
      file && { name: file.name, size: file.size, sha256: file.sha256 };
    await this.db.transaction(async (tx) => {
      await tx
        .update(documentVersions)
        .set({ storedFileId })
        .where(this.scopedVersion(organizationId, latest.id));
      await recordEvent(tx, member, {
        action: 'document.changed',
        ...this.record(row.document),
        before: { version: latest.version, upload: upload(previous) },
        after: { version: latest.version, upload: upload(next) },
      });
    });
    if (previous) await this.files.discard(previous);
    return { id };
  }

  async startVersion(member: CurrentMember, id: string) {
    const row = await this.findActive(member.organizationId, id);
    const latest = await this.latest(member.organizationId, id);
    if (!latest.confirmedAt) throw new ConflictException('This version is still a draft.');
    const version = latest.version + 1;
    await this.db.transaction(async (tx) => {
      await tx.insert(documentVersions).values({
        organizationId: member.organizationId,
        documentId: id,
        version,
        content: latest.content,
        createdById: member.id,
      });
      await recordEvent(tx, member, {
        action: 'document.version_started',
        ...this.record(row.document),
        after: { version },
      });
    });
    return { id };
  }

  /** Puts the draft in force. The last confirmed version is kept with it, as what it replaced. */
  async confirm(member: CurrentMember, id: string) {
    const row = await this.findActive(member.organizationId, id);
    const versions = await this.versions(member.organizationId, id);
    const [latest] = versions;
    if (latest.confirmedAt) throw new ConflictException('This version is already confirmed.');
    if (!latest.content.trim() && !latest.storedFileId) {
      throw new ConflictException('Add content or upload a file before confirming.');
    }
    const replaced = versions.find((version) => version.confirmedAt);
    await this.db.transaction(async (tx) => {
      await tx
        .update(documentVersions)
        .set({ confirmedAt: new Date(), confirmedById: member.id })
        .where(this.scopedVersion(member.organizationId, latest.id));
      await recordEvent(tx, member, {
        action: 'document.confirmed',
        ...this.record(row.document),
        before: replaced ? { version: replaced.version, content: replaced.content } : null,
        after: { version: latest.version, content: latest.content },
      });
    });
    return { id };
  }

  async withdraw(member: CurrentMember, id: string, reason: string) {
    const row = await this.findActive(member.organizationId, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ withdrawnAt: new Date(), withdrawnReason: reason })
        .where(this.scoped(member.organizationId, id));
      await recordEvent(tx, member, {
        action: 'document.withdrawn',
        ...this.record(row.document),
        reason,
      });
    });
    return { id };
  }

  async reinstate(member: CurrentMember, id: string, reason: string) {
    const row = await this.find(member.organizationId, id);
    if (!row.document.withdrawnAt) throw new ConflictException('This Document is not withdrawn.');
    const owner = await ownerOnReturn(this.db, member, row.document, row.ownerName);
    await this.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ withdrawnAt: null, withdrawnReason: null, ownerId: owner.id })
        .where(this.scoped(member.organizationId, id));
      await recordEvent(tx, member, {
        action: 'document.reinstated',
        ...this.record(row.document),
        ...owner.change,
        reason,
      });
    });
    return { id };
  }

  /** For a Document made by mistake. The record and its trail stay; it leaves the list. */
  async delete(member: CurrentMember, id: string, reason: string) {
    const { organizationId } = member;
    const row = await this.findActive(organizationId, id);
    const versions = await this.versions(organizationId, id);
    if (versions.some((version) => version.confirmedAt)) {
      throw new ConflictException('This Document has a Confirmation, so it stays. Withdraw it.');
    }
    const [used] = await this.db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.organizationId, organizationId), eq(evidence.documentId, id)));
    if (used) throw new ConflictException('This Document is used as Evidence, so it stays.');
    const uploads = await Promise.all(
      versions.flatMap((version) =>
        version.storedFileId ? [this.files.find(organizationId, version.storedFileId)] : [],
      ),
    );
    await this.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(this.scoped(organizationId, id));
      await tx
        .update(documentVersions)
        .set({ storedFileId: null })
        .where(this.ofDocument(organizationId, id));
      await recordEvent(tx, member, {
        action: 'document.deleted',
        ...this.record(row.document),
        before: { title: row.document.title, kind: row.document.kind, content: versions[0].content },
        reason,
      });
    });
    await Promise.all(uploads.map((file) => this.files.discard(file)));
  }

  private scoped(organizationId: string, id: string) {
    return and(eq(documents.organizationId, organizationId), eq(documents.id, id));
  }

  private scopedVersion(organizationId: string, id: string) {
    return and(eq(documentVersions.organizationId, organizationId), eq(documentVersions.id, id));
  }

  private ofDocument(organizationId: string, documentId: string) {
    return and(
      eq(documentVersions.organizationId, organizationId),
      eq(documentVersions.documentId, documentId),
    );
  }

  private record(document: Pick<DocumentRow, 'id' | 'title'>) {
    return {
      recordType: 'document' as const,
      recordId: document.id,
      recordLabel: document.title,
    };
  }

  private rows(organizationId: string, filter?: SQL) {
    return this.db
      .select({ document: documents, ownerName: users.name })
      .from(documents)
      .innerJoin(members, eq(members.id, documents.ownerId))
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(documents.organizationId, organizationId), isNull(documents.deletedAt), filter))
      .orderBy(asc(documents.title));
  }

  private async find(organizationId: string, id: string) {
    const [row] = await this.rows(organizationId, eq(documents.id, id));
    if (!row) throw new NotFoundException('This Document does not exist.');
    return row;
  }

  private async findActive(organizationId: string, id: string) {
    const row = await this.find(organizationId, id);
    if (row.document.withdrawnAt) {
      throw new ConflictException('Reinstate this Document to change it.');
    }
    return row;
  }

  /** Newest first. Every Document has at least one version. */
  private versions(organizationId: string, documentId: string) {
    return this.db
      .select()
      .from(documentVersions)
      .where(this.ofDocument(organizationId, documentId))
      .orderBy(desc(documentVersions.version));
  }

  private async latest(organizationId: string, documentId: string) {
    const [latest] = await this.versions(organizationId, documentId);
    return latest;
  }

  private summary(
    { document, ownerName }: { document: DocumentRow; ownerName: string },
    versions: VersionRow[],
  ) {
    const [latest] = versions;
    const inForce = versions.find((version) => version.confirmedAt);
    return {
      id: document.id,
      title: document.title,
      kind: document.kind,
      ownerId: document.ownerId,
      ownerName,
      version: latest.version,
      versionInForce: inForce?.version ?? null,
      lastConfirmedAt: inForce?.confirmedAt ?? null,
      withdrawnAt: document.withdrawnAt,
      withdrawnReason: document.withdrawnReason,
      state: document.withdrawnAt ? 'Withdrawn' : latest.confirmedAt ? 'Confirmed' : 'Draft',
    };
  }
}
