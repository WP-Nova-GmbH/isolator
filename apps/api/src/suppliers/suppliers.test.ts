import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { assets, members, organizations, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { MembersService } from '../members/members.service';
import { NonconformitiesService } from '../nonconformities/nonconformities.service';
import { RiskCriteriaService } from '../risks/risk-criteria.service';
import { RisksService } from '../risks/risks.service';
import { SoaService } from '../soa/soa.service';
import { IncidentsService } from '../incidents/incidents.service';
import { taskInput, TasksService } from '../tasks/tasks.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { supplierFileInput, SuppliersService, type SupplierInput } from './suppliers.service';

const { db, client } = createDb(testDatabaseUrl());
const trail = new AuditTrailService(db);
const { files } = testFiles(db);
const suppliers = new SuppliersService(db, trail, files);
const risks = new RisksService(db, new RiskCriteriaService(db), trail);
const tasks = new TasksService(
  db,
  risks,
  suppliers,
  new IncidentsService(db, risks, trail),
  new NonconformitiesService(db, trail),
  new SoaService(db, trail),
);

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
  const owner = await addMember(row.id, 'Owner');
  const colleague = await addMember(row.id, 'Colleague');
  const [asset] = await db
    .insert(assets)
    .values({ organizationId: row.id, name: 'Mail', type: 'service', ownerId: owner.id })
    .returning();
  return { id: row.id, owner, colleague, asset };
}

function input(ownerId: string, overrides: Partial<SupplierInput> = {}): SupplierInput {
  return {
    name: 'Hosting Ltd',
    provides: 'Servers',
    ownerId,
    criticality: 'medium',
    handlesPersonalData: false,
    contact: 'security@example.com',
    contractEnds: null,
    exitPlan: '',
    nextReviewOn: '2099-01-01',
    ...overrides,
  };
}

const review = {
  reviewedOn: '2026-01-15',
  outcome: 'no_concerns' as const,
  notes: 'Read their latest audit report.',
  nextReviewOn: '2099-06-01',
};

const file = {
  kind: 'contract' as const,
  title: 'Hosting contract',
  location: 'SharePoint, Legal folder',
  storedFileId: null,
  datedOn: '2026-01-01',
  expiresOn: null,
};

const riskInput = (ownerId: string) => ({
  title: 'Outage',
  description: '',
  ownerId,
  likelihood: 2,
  impact: 3,
  residualLikelihood: null,
  residualImpact: null,
  treatment: null,
  reviewOn: '2099-01-01',
});

describe('supplier register', () => {
  it('numbers Suppliers per Organization and never reuses a number', async () => {
    const a = await organization();
    const b = await organization();
    const first = await suppliers.create(a.owner, input(a.owner.id));
    expect(first).toEqual({ ref: 'S-01' });
    expect(await suppliers.create(b.owner, input(b.owner.id))).toEqual({ ref: 'S-01' });

    await suppliers.delete(a.owner, first.ref, 'Mistake');
    expect(await suppliers.create(a.owner, input(a.owner.id))).toEqual({ ref: 'S-02' });
  });

  it('records every change in the Audit trail', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.update(org.colleague, ref, input(org.owner.id, { criticality: 'high' }));
    await suppliers.update(org.colleague, ref, input(org.owner.id, { criticality: 'high' }));

    const { history } = await suppliers.get(org.id, ref);
    expect(history.map((event) => event.action)).toEqual(['supplier.changed', 'supplier.added']);
    expect(history[0]).toMatchObject({
      memberName: 'Colleague',
      before: { criticality: 'medium' },
      after: { criticality: 'high' },
    });
  });
});

describe('reviews', () => {
  it('move the next review date on and clear an overdue review', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(
      org.owner,
      input(org.owner.id, { nextReviewOn: '2020-01-01' }),
    );
    expect((await suppliers.get(org.id, ref)).state).toBe('Review overdue');

    await suppliers.addReview(org.colleague, ref, review);
    const supplier = await suppliers.get(org.id, ref);
    expect(supplier).toMatchObject({ state: 'Reviewed', nextReviewOn: '2099-06-01' });
    expect(supplier.reviews).toEqual([
      expect.objectContaining({ reviewerName: 'Colleague', outcome: 'no_concerns' }),
    ]);
    expect(supplier.history[0]).toMatchObject({
      action: 'supplier.reviewed',
      after: { notes: 'Read their latest audit report.' },
    });
  });

  it('can’t be recorded before they happen', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await expect(
      suppliers.addReview(org.owner, ref, { ...review, reviewedOn: '2098-01-01' }),
    ).rejects.toThrow('once it has happened');
  });

  it('pass their outcome on, the newest one counting', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.addReview(org.owner, ref, { ...review, outcome: 'concerns' });
    expect((await suppliers.get(org.id, ref)).attention).toContain(
      'The last review raised concerns.',
    );
    await suppliers.addReview(org.owner, ref, { ...review, reviewedOn: '2026-02-01' });
    expect((await suppliers.get(org.id, ref)).attention).not.toContain(
      'The last review raised concerns.',
    );
  });
});

describe('files', () => {
  it('count towards what is on file, and the trail keeps what was removed', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    expect((await suppliers.get(org.id, ref)).attention).toContain('No contract on file.');

    await suppliers.addFile(org.owner, ref, file);
    const supplier = await suppliers.get(org.id, ref);
    expect(supplier.attention).toEqual([]);
    expect(supplier.files[0]).toMatchObject({ title: 'Hosting contract', state: 'Current' });

    await suppliers.removeFile(org.colleague, ref, supplier.files[0].id);
    const after = await suppliers.get(org.id, ref);
    expect(after.files).toEqual([]);
    expect(after.history[0]).toMatchObject({
      action: 'supplier.file_removed',
      memberName: 'Colleague',
      before: { title: 'Hosting contract', location: 'SharePoint, Legal folder' },
    });
  });
});

describe('uploaded files', () => {
  const upload = {
    originalname: 'contract.pdf',
    mimetype: 'application/pdf',
    size: 5,
    buffer: Buffer.from('hello'),
  };

  it('can stand in for saying where a file is kept', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    const stored = await files.store(org.owner, upload);
    await suppliers.addFile(org.owner, ref, { ...file, location: null, storedFileId: stored.id });

    const supplier = await suppliers.get(org.id, ref);
    expect(supplier.files[0]).toMatchObject({
      location: null,
      upload: { id: stored.id, name: 'contract.pdf', size: 5 },
    });
    expect(supplier.attention).toEqual([]);
    expect(supplier.history[0]).toMatchObject({
      action: 'supplier.file_added',
      after: { upload: { name: 'contract.pdf', sha256: stored.sha256 } },
    });
  });

  it('need the upload or a location', () => {
    const missing = { ...file, location: null, storedFileId: null };
    expect(supplierFileInput.safeParse(missing).success).toBe(false);
  });

  it('ask for a name in words when there is nothing to take it from', () => {
    const { title: _title, ...unnamed } = file;
    const { error } = supplierFileInput.safeParse({ ...unnamed, location: null });
    expect(error?.issues[0].message).toBe('Name the file, or upload one.');
  });

  it('go when the entry goes, and the trail keeps the proof of what they were', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    const stored = await files.store(org.owner, upload);
    await suppliers.addFile(org.owner, ref, { ...file, storedFileId: stored.id });
    await expect(files.removeUnlinked(org.id, stored.id)).rejects.toThrow('in use');

    const [{ id }] = (await suppliers.get(org.id, ref)).files;
    await suppliers.removeFile(org.colleague, ref, id);

    await expect(files.open(org.id, stored.id)).rejects.toThrow('does not exist');
    expect((await suppliers.get(org.id, ref)).history[0]).toMatchObject({
      action: 'supplier.file_removed',
      memberName: 'Colleague',
      before: { upload: { name: 'contract.pdf', size: 5, sha256: stored.sha256 } },
    });
  });

  it('can’t come from another Organization', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await suppliers.create(a.owner, input(a.owner.id));
    const stored = await files.store(b.owner, upload);
    await expect(
      suppliers.addFile(a.owner, ref, { ...file, storedFileId: stored.id }),
    ).rejects.toThrow('does not exist');
  });
});

describe('assets and risks', () => {
  it('link an asset to one Supplier, and show the risks that follow from it', async () => {
    const org = await organization();
    const first = await suppliers.create(org.owner, input(org.owner.id));
    const second = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.linkAsset(org.owner, first.ref, org.asset.id);
    await expect(suppliers.linkAsset(org.owner, second.ref, org.asset.id)).rejects.toThrow(
      'Another Supplier',
    );

    const { ref } = await risks.create(org.owner, riskInput(org.owner.id));
    await risks.linkAsset(org.owner, ref, org.asset.id);
    const supplier = await suppliers.get(org.id, first.ref);
    expect(supplier.assets.map((asset) => asset.name)).toEqual(['Mail']);
    expect(supplier.risks.map((risk) => risk.ref)).toEqual([ref]);
    expect(supplier.assetCount).toBe(1);

    await risks.close(org.owner, ref, 'Gone');
    expect((await suppliers.get(org.id, first.ref)).risks).toEqual([]);
  });
});

describe('ending a Supplier', () => {
  it('needs its assets moved and its Tasks finished first', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.linkAsset(org.owner, ref, org.asset.id);
    const task = await tasks.create(org.owner, {
      title: 'Ask for the report',
      ownerId: org.owner.id,
      dueOn: '2099-01-01',
      supplierRef: ref,
    });

    await expect(suppliers.end(org.owner, ref, 'Moved')).rejects.toThrow('still provides');
    await suppliers.unlinkAsset(org.owner, ref, org.asset.id);
    await expect(suppliers.end(org.owner, ref, 'Moved')).rejects.toThrow('open Task');
    await tasks.finish(org.owner, task.id);
    await expect(suppliers.end(org.owner, ref, 'Moved')).resolves.toEqual({ ref });
  });

  it('moves it out of the register, freezes it, and keeps it on record', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.end(org.colleague, ref, 'We moved to another host');

    expect(await suppliers.list(org.id)).toEqual([]);
    const [ended] = await suppliers.list(org.id, 'ended');
    expect(ended).toMatchObject({
      ref,
      state: 'Ended',
      endedReason: 'We moved to another host',
      attention: [],
    });
    await expect(suppliers.update(org.owner, ref, input(org.owner.id))).rejects.toThrow('Resume');
    await expect(suppliers.addReview(org.owner, ref, review)).rejects.toThrow('Resume');
    await expect(suppliers.addFile(org.owner, ref, file)).rejects.toThrow('Resume');
    await expect(
      tasks.create(org.owner, { title: 'x', ownerId: org.owner.id, dueOn: '2099-01-01', supplierRef: ref }),
    ).rejects.toThrow('Resume');
  });

  it('can be undone, with a reason', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await expect(suppliers.resume(org.owner, ref, 'Back')).rejects.toThrow('has not ended');
    await suppliers.end(org.owner, ref, 'Moved');
    await suppliers.resume(org.colleague, ref, 'Moved back');

    const supplier = await suppliers.get(org.id, ref);
    expect(supplier).toMatchObject({ endedAt: null, endedReason: null });
    expect(supplier.history[0]).toMatchObject({ action: 'supplier.resumed', reason: 'Moved back' });
  });

  it('goes to whoever resumes it if its owner has left', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.colleague.id));
    await suppliers.end(org.owner, ref, 'Moved');
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await suppliers.resume(org.owner, ref, 'Moved back');

    const record = await suppliers.get(org.id, ref);
    expect(record).toMatchObject({ ownerId: org.owner.id, ownerName: 'Owner' });
    expect(record.history[0]).toMatchObject({
      action: 'supplier.resumed',
      before: { ownerName: 'Colleague' },
      after: { ownerName: 'Owner' },
    });
  });
});

describe('deleting a Supplier', () => {
  it('takes it out of the register but keeps the record in the Audit trail', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.delete(org.colleague, ref, 'Entered twice');

    expect(await suppliers.list(org.id)).toEqual([]);
    expect(await suppliers.list(org.id, 'ended')).toEqual([]);
    await expect(suppliers.get(org.id, ref)).rejects.toThrow('does not exist');
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'supplier.deleted',
      recordRef: ref,
      recordLabel: 'Hosting Ltd',
      reason: 'Entered twice',
      before: { provides: 'Servers' },
    });
  });

  it('is refused once there is a review or a file on record', async () => {
    const org = await organization();
    const reviewed = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.addReview(org.owner, reviewed.ref, review);
    await expect(suppliers.delete(org.owner, reviewed.ref, 'x')).rejects.toThrow('stays');

    const filed = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.addFile(org.owner, filed.ref, file);
    await expect(suppliers.delete(org.owner, filed.ref, 'x')).rejects.toThrow('stays');
  });

  it('is refused once it has ended', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await suppliers.end(org.owner, ref, 'Moved');
    await expect(suppliers.delete(org.owner, ref, 'Mistake')).rejects.toThrow('Resume');
  });
});

describe('Tasks on a Supplier', () => {
  it('show which Supplier they belong to', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, input(org.owner.id));
    await tasks.create(org.owner, {
      title: 'Ask for the report',
      ownerId: org.colleague.id,
      dueOn: '2099-01-01',
      supplierRef: ref,
    });
    const [task] = await tasks.list(org.id, { supplierRef: ref });
    expect(task).toMatchObject({
      ownerName: 'Colleague',
      belongsTo: { kind: 'supplier', ref, title: 'Hosting Ltd' },
    });
  });

  it('need exactly one record to belong to', async () => {
    const base = { title: 'x', ownerId: randomUUID(), dueOn: '2099-01-01' };
    expect(taskInput.safeParse(base).success).toBe(false);
    expect(taskInput.safeParse({ ...base, riskRef: 'R-01', supplierRef: 'S-01' }).success).toBe(false);
    expect(taskInput.safeParse({ ...base, supplierRef: 'S-01' }).success).toBe(true);
  });
});

describe('tenancy', () => {
  it('keeps one Organization’s Suppliers from another', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await suppliers.create(a.owner, input(a.owner.id));
    await suppliers.addFile(a.owner, ref, file);
    const [{ id: fileId }] = (await suppliers.get(a.id, ref)).files;

    expect(await suppliers.list(b.id)).toEqual([]);
    await expect(suppliers.get(b.id, ref)).rejects.toThrow('does not exist');
    await expect(suppliers.update(b.owner, ref, input(b.owner.id))).rejects.toThrow('does not exist');
    await expect(suppliers.addReview(b.owner, ref, review)).rejects.toThrow('does not exist');
    await expect(suppliers.removeFile(b.owner, ref, fileId)).rejects.toThrow('does not exist');
    await expect(suppliers.delete(b.owner, ref, 'x')).rejects.toThrow('does not exist');
  });

  it('refuses owners and assets from another Organization', async () => {
    const a = await organization();
    const b = await organization();
    await expect(suppliers.create(a.owner, input(b.owner.id))).rejects.toThrow('Choose an owner');
    const { ref } = await suppliers.create(a.owner, input(a.owner.id));
    await expect(suppliers.linkAsset(a.owner, ref, b.asset.id)).rejects.toThrow('Choose an asset');
    const [asset] = await db.select().from(assets).where(eq(assets.id, b.asset.id));
    expect(asset.supplierId).toBeNull();
  });
});
