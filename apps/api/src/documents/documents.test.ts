import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { MembersService } from '../members/members.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { DocumentsService, type DocumentInput } from './documents.service';

const { db, client } = createDb(testDatabaseUrl());
const { files } = testFiles(db);
const trail = new AuditTrailService(db);
const documents = new DocumentsService(db, trail, files);

const membersService = new MembersService(db);

afterAll(() => client.end());

async function addMember(organizationId: string, name: string): Promise<CurrentMember> {
  const [user] = await db
    .insert(users)
    .values({ name, email: `${randomUUID()}@example.com` })
    .returning();
  const [member] = await db.insert(members).values({ organizationId, userId: user.id }).returning();
  return { id: member.id, organizationId, organizationName: 'Test', name, email: user.email };
}

async function organization() {
  const [row] = await db.insert(organizations).values({ name: 'Test' }).returning();
  return {
    id: row.id,
    owner: await addMember(row.id, 'Owner'),
    colleague: await addMember(row.id, 'Colleague'),
  };
}

function input(ownerId: string, overrides: Partial<DocumentInput> = {}): DocumentInput {
  return { title: 'Access policy', kind: 'policy', ownerId, content: 'Rules', ...overrides };
}

const upload = (content = 'hello') => ({
  originalname: 'policy.pdf',
  mimetype: 'application/pdf',
  size: Buffer.byteLength(content),
  buffer: Buffer.from(content),
});

describe('Documents', () => {
  it('start as a draft at version 1', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    expect(await documents.get(org.id, id)).toMatchObject({
      state: 'Draft',
      version: 1,
      versionInForce: null,
      content: 'Rules',
      deletable: true,
    });
  });

  it('can change freely while a draft, and the trail keeps both texts', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    await documents.update(org.colleague, id, input(org.owner.id, { content: 'Better rules' }));
    await documents.update(org.colleague, id, input(org.owner.id, { content: 'Better rules' }));
    const { history, content, version } = await documents.get(org.id, id);
    expect(content).toBe('Better rules');
    expect(version).toBe(1);
    expect(history.map((event) => event.action)).toEqual(['document.changed', 'document.added']);
    expect(history[0]).toMatchObject({
      memberName: 'Colleague',
      before: { content: 'Rules' },
      after: { content: 'Better rules' },
    });
  });
});

describe('confirming a version', () => {
  it('needs content or a file', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id, { content: '  ' }));
    await expect(documents.confirm(org.owner, id)).rejects.toThrow('Add content');
    const stored = await files.store(org.owner, upload());
    await documents.setFile(org.owner, id, stored.id);
    await expect(documents.confirm(org.owner, id)).resolves.toEqual({ id });
  });

  it('puts it in force and freezes it', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    await documents.confirm(org.colleague, id);
    expect(await documents.get(org.id, id)).toMatchObject({
      state: 'Confirmed',
      versionInForce: 1,
      deletable: false,
    });
    await expect(documents.confirm(org.owner, id)).rejects.toThrow('already confirmed');
    await expect(
      documents.update(org.owner, id, input(org.owner.id, { content: 'Changed' })),
    ).rejects.toThrow('new version');
  });

  it('keeps the title and owner editable on a confirmed version', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    await documents.confirm(org.owner, id);
    await documents.update(org.owner, id, input(org.colleague.id, { title: 'Renamed' }));
    expect(await documents.get(org.id, id)).toMatchObject({
      title: 'Renamed',
      ownerName: 'Colleague',
      state: 'Confirmed',
    });
  });
});

describe('a new version', () => {
  it('starts from the last text, and the old one stays in force until it is confirmed', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    await expect(documents.startVersion(org.owner, id)).rejects.toThrow('still a draft');
    await documents.confirm(org.owner, id);
    await documents.startVersion(org.colleague, id);

    let document = await documents.get(org.id, id);
    expect(document).toMatchObject({ version: 2, versionInForce: 1, state: 'Draft', content: 'Rules' });

    await documents.update(org.owner, id, input(org.owner.id, { content: 'New rules' }));
    await documents.confirm(org.owner, id);
    document = await documents.get(org.id, id);
    expect(document).toMatchObject({ version: 2, versionInForce: 2, state: 'Confirmed' });
    expect(document.versions.map(({ version }) => version)).toEqual([2, 1]);
    expect(document.history[0]).toMatchObject({
      action: 'document.confirmed',
      before: { version: 1, content: 'Rules' },
      after: { version: 2, content: 'New rules' },
    });
  });
});

describe('uploaded files', () => {
  it('replace each other on a draft, and the trail keeps both hashes', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    const first = await files.store(org.owner, upload('one'));
    const second = await files.store(org.owner, upload('two'));
    await documents.setFile(org.owner, id, first.id);
    await documents.setFile(org.colleague, id, second.id);

    await expect(files.open(org.id, first.id)).rejects.toThrow('does not exist');
    const document = await documents.get(org.id, id);
    expect(document.upload?.id).toBe(second.id);
    expect(document.history[0]).toMatchObject({
      before: { upload: { sha256: first.sha256 } },
      after: { upload: { sha256: second.sha256 } },
    });
  });

  it('stay with a confirmed version, and aren’t carried into the next one', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    const stored = await files.store(org.owner, upload());
    await documents.setFile(org.owner, id, stored.id);
    await documents.confirm(org.owner, id);
    await expect(documents.setFile(org.owner, id, null)).rejects.toThrow('new version');

    await documents.startVersion(org.owner, id);
    const document = await documents.get(org.id, id);
    expect(document.upload).toBeNull();
    expect(document.versions[1].upload?.id).toBe(stored.id);
    await expect(files.removeUnlinked(org.id, stored.id)).rejects.toThrow('in use');
  });

  it('can’t come from another Organization', async () => {
    const a = await organization();
    const b = await organization();
    const { id } = await documents.create(a.owner, input(a.owner.id));
    const stored = await files.store(b.owner, upload());
    await expect(documents.setFile(a.owner, id, stored.id)).rejects.toThrow('does not exist');
  });
});

describe('withdrawing a Document', () => {
  it('moves it out of the list, freezes it, and can be undone', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    await documents.confirm(org.owner, id);
    await documents.withdraw(org.colleague, id, 'Merged into the main policy');

    expect(await documents.list(org.id)).toEqual([]);
    const [withdrawn] = await documents.list(org.id, 'withdrawn');
    expect(withdrawn).toMatchObject({ state: 'Withdrawn', withdrawnReason: 'Merged into the main policy' });
    await expect(documents.startVersion(org.owner, id)).rejects.toThrow('Reinstate');
    await expect(documents.update(org.owner, id, input(org.owner.id))).rejects.toThrow('Reinstate');

    await documents.reinstate(org.owner, id, 'Needed again');
    expect((await documents.get(org.id, id)).state).toBe('Confirmed');
  });

  it('goes to whoever reinstates it if its owner has left', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.colleague.id));
    await documents.withdraw(org.owner, id, 'Merged');
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await documents.reinstate(org.owner, id, 'Needed again');

    const record = await documents.get(org.id, id);
    expect(record).toMatchObject({ ownerId: org.owner.id, ownerName: 'Owner' });
    expect(record.history[0]).toMatchObject({
      action: 'document.reinstated',
      before: { ownerName: 'Colleague' },
      after: { ownerName: 'Owner' },
    });
  });
});

describe('deleting a Document', () => {
  it('takes it and its uploads away, and keeps it in the Audit trail', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    const stored = await files.store(org.owner, upload());
    await documents.setFile(org.owner, id, stored.id);
    await documents.delete(org.colleague, id, 'Made by mistake');

    expect(await documents.list(org.id)).toEqual([]);
    await expect(documents.get(org.id, id)).rejects.toThrow('does not exist');
    await expect(files.open(org.id, stored.id)).rejects.toThrow('does not exist');
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'document.deleted',
      recordLabel: 'Access policy',
      reason: 'Made by mistake',
      before: { content: 'Rules' },
    });
  });

  it('is refused once a version has been confirmed', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    await documents.confirm(org.owner, id);
    await expect(documents.delete(org.owner, id, 'Mistake')).rejects.toThrow('stays');
  });

  it('is refused once it is withdrawn', async () => {
    const org = await organization();
    const { id } = await documents.create(org.owner, input(org.owner.id));
    await documents.withdraw(org.owner, id, 'Merged');
    await expect(documents.delete(org.owner, id, 'Mistake')).rejects.toThrow('Reinstate');
  });
});

describe('tenancy', () => {
  it('keeps one Organization’s Documents from another', async () => {
    const a = await organization();
    const b = await organization();
    const { id } = await documents.create(a.owner, input(a.owner.id));
    expect(await documents.list(b.id)).toEqual([]);
    await expect(documents.get(b.id, id)).rejects.toThrow('does not exist');
    await expect(documents.update(b.owner, id, input(b.owner.id))).rejects.toThrow('does not exist');
    await expect(documents.confirm(b.owner, id)).rejects.toThrow('does not exist');
    await expect(documents.delete(b.owner, id, 'x')).rejects.toThrow('does not exist');
    await expect(documents.create(a.owner, input(b.owner.id))).rejects.toThrow('Choose an owner');
  });
});
