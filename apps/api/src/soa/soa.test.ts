import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import { DocumentsService } from '../documents/documents.service';
import { IncidentsService } from '../incidents/incidents.service';
import type { CurrentMember } from '../members/current-member';
import { NonconformitiesService } from '../nonconformities/nonconformities.service';
import { RiskCriteriaService } from '../risks/risk-criteria.service';
import { RisksService } from '../risks/risks.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { TasksService } from '../tasks/tasks.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { evidenceInput, EvidenceService } from './evidence.service';
import { SoaService, type SoaEntryInput } from './soa.service';

const { db, client } = createDb(testDatabaseUrl());
const { files } = testFiles(db);
const trail = new AuditTrailService(db);
const soa = new SoaService(db, trail);
const proof = new EvidenceService(db, soa, files);
const docs = new DocumentsService(db, trail, files);
const risks = new RisksService(db, new RiskCriteriaService(db), trail);
const tasks = new TasksService(
  db,
  risks,
  new SuppliersService(db, trail, files),
  new IncidentsService(db, risks, trail),
  new NonconformitiesService(db, trail),
  soa,
);

afterAll(() => client.end());

async function addMember(organizationId: string, name: string): Promise<CurrentMember> {
  const [user] = await db
    .insert(users)
    .values({ name, email: `${randomUUID()}@example.com` })
    .returning();
  const [member] = await db.insert(members).values({ organizationId, userId: user.id }).returning();
  return {
    id: member.id,
    organizationId,
    organizationName: 'Test',
    name,
    email: user.email,
    role: member.role,
  };
}

async function organization() {
  const [row] = await db.insert(organizations).values({ name: 'Test' }).returning();
  return {
    id: row.id,
    owner: await addMember(row.id, 'Owner'),
    colleague: await addMember(row.id, 'Colleague'),
  };
}

function input(overrides: Partial<SoaEntryInput> = {}): SoaEntryInput {
  return {
    applicable: true,
    status: 'partial',
    justification: 'We hold customer data.',
    ownerId: null,
    ...overrides,
  };
}

const item = {
  title: 'Access review',
  location: 'SharePoint',
  storedFileId: null,
  documentId: null,
  datedOn: '2026-01-15',
  expiresOn: null,
};

const upload = {
  originalname: 'review.pdf',
  mimetype: 'application/pdf',
  size: 5,
  buffer: Buffer.from('hello'),
};

describe('Statement of Applicability', () => {
  it('has one entry per catalog control, in natural order', async () => {
    const org = await organization();
    const entries = await soa.list(org.id);
    expect(entries).toHaveLength(93);
    const refs = entries.map((entry) => entry.ref);
    expect(refs.indexOf('A.5.2')).toBeLessThan(refs.indexOf('A.5.10'));
    expect(await soa.list(org.id)).toHaveLength(93);
  });

  it('adds own controls after the catalog, numbered per Organization', async () => {
    const a = await organization();
    const b = await organization();
    expect(await soa.addOwnControl(a.owner, 'Delete data at contract end')).toEqual({ ref: 'OWN-1' });
    expect(await soa.addOwnControl(a.owner, 'Second')).toEqual({ ref: 'OWN-2' });
    expect(await soa.addOwnControl(b.owner, 'Theirs')).toEqual({ ref: 'OWN-1' });

    const entries = await soa.list(a.id);
    expect(entries).toHaveLength(95);
    expect(entries[93]).toMatchObject({ ref: 'OWN-1', own: true, theme: 'own' });
    expect((await soa.get(a.id, 'OWN-1')).title).toBe('Delete data at contract end');
  });

  it('finds an entry before anyone has listed the SoA', async () => {
    const org = await organization();
    expect((await soa.get(org.id, 'A.8.13')).title).toBe('Information backup');
  });

  it('records changes in the Audit trail, and skips saves that change nothing', async () => {
    const org = await organization();
    await soa.update(org.colleague, 'A.5.15', input({ ownerId: org.owner.id }));
    await soa.update(org.colleague, 'A.5.15', input({ ownerId: org.owner.id }));
    const { history, ownerName } = await soa.get(org.id, 'A.5.15');
    expect(ownerName).toBe('Owner');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      action: 'soa.changed',
      memberName: 'Colleague',
      before: { status: 'not_started', ownerName: null },
      after: { status: 'partial', ownerName: 'Owner' },
    });
  });
});

describe('Confirmations on SoA entries', () => {
  it('need a justification', async () => {
    const org = await organization();
    await expect(soa.confirm(org.owner, 'A.5.15')).rejects.toThrow('justification');
  });

  it('can come from any Member, and lapse when the decision changes', async () => {
    const org = await organization();
    await soa.update(org.owner, 'A.5.15', input());
    await soa.confirm(org.colleague, 'A.5.15');
    expect((await soa.get(org.id, 'A.5.15')).confirmation).toMatchObject({ by: 'Colleague' });
    await expect(soa.confirm(org.owner, 'A.5.15')).rejects.toThrow('already confirmed');

    await soa.update(org.owner, 'A.5.15', input({ status: 'implemented' }));
    expect((await soa.get(org.id, 'A.5.15')).confirmation).toBeNull();

    await soa.confirm(org.owner, 'A.5.15');
    expect((await soa.get(org.id, 'A.5.15')).history[0]).toMatchObject({
      action: 'soa.confirmed',
      before: { status: 'partial' },
      after: { status: 'implemented' },
    });
  });

  it('stay valid when only the owner changes', async () => {
    const org = await organization();
    await soa.update(org.owner, 'A.5.15', input());
    await soa.confirm(org.owner, 'A.5.15');
    await soa.update(org.owner, 'A.5.15', input({ ownerId: org.colleague.id }));
    expect((await soa.get(org.id, 'A.5.15')).confirmation).not.toBeNull();
  });
});

describe('Evidence', () => {
  it('counts on its entry, and shows when it has expired', async () => {
    const org = await organization();
    await proof.add(org.owner, 'A.5.15', { ...item, expiresOn: '2026-02-01' });
    await proof.add(org.owner, 'A.5.15', item);

    const entry = (await soa.list(org.id)).find(({ ref }) => ref === 'A.5.15');
    expect(entry).toMatchObject({ evidenceCount: 2, expiredEvidence: 1 });
    const listed = await proof.list(org.id, 'A.5.15');
    expect(listed.map(({ state }) => state).sort()).toEqual(['Current', 'Expired']);
    expect(listed[0]).toMatchObject({ ref: 'A.5.15', controlTitle: 'Access control', kind: 'File' });
  });

  it('can be an upload, named after the file, and the trail keeps its hash', async () => {
    const org = await organization();
    const stored = await files.store(org.owner, upload);
    await proof.add(org.owner, 'A.5.15', {
      ...item,
      title: null,
      location: null,
      storedFileId: stored.id,
    });
    const [listed] = await proof.list(org.id);
    expect(listed).toMatchObject({ title: 'review.pdf', upload: { id: stored.id } });
    expect((await soa.get(org.id, 'A.5.15')).history[0]).toMatchObject({
      action: 'soa.evidence_added',
      after: { upload: { sha256: stored.sha256 } },
    });
    await expect(files.removeUnlinked(org.id, stored.id)).rejects.toThrow('in use');
  });

  it('can link a Document, which then shows it is used', async () => {
    const org = await organization();
    const { id } = await docs.create(org.owner, {
      title: 'Access policy',
      kind: 'policy',
      ownerId: org.owner.id,
      content: 'Rules',
      datedOn: null,
    });
    await proof.add(org.owner, 'A.5.15', { ...item, title: null, location: null, documentId: id });
    const [listed] = await proof.list(org.id);
    expect(listed).toMatchObject({ title: 'Access policy', kind: 'Document', document: { id } });
    const document = await docs.get(org.id, id);
    expect(document.usedAsEvidence).toEqual([{ ref: 'A.5.15', title: 'Access control' }]);
    expect(document.deletable).toBe(false);
  });

  it('needs something to point at', () => {
    const missing = { ...item, location: null };
    expect(evidenceInput.safeParse(missing).success).toBe(false);
    const dates = { ...item, expiresOn: '2025-01-01' };
    expect(evidenceInput.safeParse(dates).error?.issues[0].message).toContain('expire');
  });

  it('can have a date nobody knows, and lists after what is dated', async () => {
    const org = await organization();
    await proof.add(org.owner, 'A.5.15', { ...item, title: 'Undated', datedOn: null });
    await proof.add(org.owner, 'A.5.15', item);
    const listed = await proof.list(org.id);
    expect(listed.map(({ title, datedOn }) => ({ title, datedOn }))).toEqual([
      { title: 'Access review', datedOn: '2026-01-15' },
      { title: 'Undated', datedOn: null },
    ]);
  });

  it('goes with its upload when removed, and the trail keeps the proof', async () => {
    const org = await organization();
    const stored = await files.store(org.owner, upload);
    const { id } = await proof.add(org.owner, 'A.5.15', {
      ...item,
      location: null,
      storedFileId: stored.id,
    });
    await proof.remove(org.colleague, id);
    expect(await proof.list(org.id)).toEqual([]);
    await expect(files.open(org.id, stored.id)).rejects.toThrow('does not exist');
    expect((await soa.get(org.id, 'A.5.15')).history[0]).toMatchObject({
      action: 'soa.evidence_removed',
      memberName: 'Colleague',
      before: { upload: { name: 'review.pdf', sha256: stored.sha256 } },
    });
  });
});

describe('Tasks on an SoA entry', () => {
  it('work for catalog and own controls', async () => {
    const org = await organization();
    await soa.addOwnControl(org.owner, 'Our own');
    const task = { ownerId: org.owner.id, dueOn: '2099-01-01' };
    await tasks.create(org.owner, { ...task, title: 'One', soaRef: 'A.5.15' });
    await tasks.create(org.owner, { ...task, title: 'Two', soaRef: 'OWN-1' });

    const [first] = await tasks.list(org.id, { soaRef: 'A.5.15' });
    expect(first.belongsTo).toEqual({ kind: 'soa', ref: 'A.5.15', title: 'Access control' });
    const [second] = await tasks.list(org.id, { soaRef: 'OWN-1' });
    expect(second.belongsTo).toEqual({ kind: 'soa', ref: 'OWN-1', title: 'Our own' });
  });
});

describe('tenancy', () => {
  it('keeps one Organization’s SoA and Evidence from another', async () => {
    const a = await organization();
    const b = await organization();
    await soa.addOwnControl(a.owner, 'Only ours');
    await soa.update(a.owner, 'A.5.15', input());
    const { id } = await proof.add(a.owner, 'A.5.15', item);

    await expect(soa.get(b.id, 'OWN-1')).rejects.toThrow('does not exist');
    expect((await soa.get(b.id, 'A.5.15')).justification).toBe('');
    expect(await proof.list(b.id)).toEqual([]);
    await expect(proof.remove(b.owner, id)).rejects.toThrow('does not exist');
    await expect(soa.update(a.owner, 'A.5.15', input({ ownerId: b.owner.id }))).rejects.toThrow(
      'Choose an owner',
    );
  });

  it('refuses uploads and Documents from another Organization', async () => {
    const a = await organization();
    const b = await organization();
    const stored = await files.store(b.owner, upload);
    const { id } = await docs.create(b.owner, {
      title: 'Theirs',
      kind: 'policy',
      ownerId: b.owner.id,
      content: 'x',
      datedOn: null,
    });
    await expect(
      proof.add(a.owner, 'A.5.15', { ...item, storedFileId: stored.id }),
    ).rejects.toThrow('does not exist');
    await expect(proof.add(a.owner, 'A.5.15', { ...item, documentId: id })).rejects.toThrow(
      'Choose a Document',
    );
  });
});
