import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { MembersService } from '../members/members.service';
import { RiskCriteriaService } from '../risks/risk-criteria.service';
import { RisksService } from '../risks/risks.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { AssetsService, type AssetInput } from './assets.service';

const { db, client } = createDb(testDatabaseUrl());
const trail = new AuditTrailService(db);
const suppliers = new SuppliersService(db, trail, testFiles(db).files);
const assets = new AssetsService(db, suppliers, trail);
const risks = new RisksService(db, new RiskCriteriaService(db), trail);

const membersService = new MembersService(db);

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

function input(ownerId: string, overrides: Partial<AssetInput> = {}): AssetInput {
  return {
    name: 'CRM',
    type: 'software',
    status: 'operational',
    classification: 'confidential',
    ownerId,
    technicalOwnerId: null,
    location: '',
    supplierRef: null,
    validation: 'unvalidated',
    source: '',
    notes: '',
    ...overrides,
  };
}

const supplierInput = (ownerId: string) => ({
  name: 'CRM Ltd',
  provides: 'CRM',
  ownerId,
  criticality: 'medium' as const,
  handlesPersonalData: false,
  contact: '',
  contractTerm: 'rolling' as const,
  contractEnds: null,
  exitPlan: '',
  nextReviewOn: '2099-01-01',
});

async function withRisk(org: Awaited<ReturnType<typeof organization>>, assetId: string) {
  const { ref } = await risks.create(org.owner, {
    title: 'Outage',
    description: '',
    ownerId: org.owner.id,
    likelihood: 2,
    impact: 3,
    residualLikelihood: null,
    residualImpact: null,
    treatment: null,
    reviewOn: '2099-01-01',
  });
  await risks.linkAsset(org.owner, ref, assetId);
  return ref;
}

describe('retiring an asset', () => {
  it('moves it out of the register, freezes it, and keeps it on record', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    await assets.retire(org.owner, id, 'Replaced by the new CRM');

    expect(await assets.list(org.id)).toEqual([]);
    const [retired] = await assets.list(org.id, 'retired');
    expect(retired).toMatchObject({ id, retiredReason: 'Replaced by the new CRM' });
    await expect(assets.update(org.owner, id, input(org.owner.id))).rejects.toThrow('Reinstate');
    expect((await assets.get(org.id, id)).history[0]).toMatchObject({
      action: 'asset.retired',
      reason: 'Replaced by the new CRM',
    });
  });

  it('is refused while an open risk points at it', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    const ref = await withRisk(org, id);
    await expect(assets.retire(org.owner, id, 'Gone')).rejects.toThrow('open risk');
    await risks.close(org.owner, ref, 'Gone');
    await expect(assets.retire(org.owner, id, 'Gone')).resolves.toEqual({ id });
  });

  it('takes it off its Supplier, so the Supplier can end', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, supplierInput(org.owner.id));
    const { id } = await assets.create(org.owner, input(org.owner.id, { supplierRef: ref }));
    await assets.retire(org.owner, id, 'Gone');
    expect((await suppliers.get(org.id, ref)).assets).toEqual([]);
    await expect(suppliers.end(org.owner, ref, 'Moved')).resolves.toEqual({ ref });
  });

  it('stops it being linked to a risk or a Supplier', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    await assets.retire(org.owner, id, 'Gone');
    const { ref } = await suppliers.create(org.owner, supplierInput(org.owner.id));
    await expect(suppliers.linkAsset(org.owner, ref, id)).rejects.toThrow('Choose an asset');
  });

  it('can be undone, with a reason', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    await expect(assets.reinstate(org.owner, id, 'Back')).rejects.toThrow('not retired');
    await assets.retire(org.owner, id, 'Gone');
    await assets.reinstate(org.owner, id, 'Back in use');
    expect(await assets.get(org.id, id)).toMatchObject({ retiredAt: null, retiredReason: null });
  });

  it('goes to whoever reinstates it if its owner has left', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.colleague.id));
    await assets.retire(org.owner, id, 'Gone');
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await assets.reinstate(org.owner, id, 'Back in use');

    const record = await assets.get(org.id, id);
    expect(record).toMatchObject({ ownerId: org.owner.id, ownerName: 'Owner' });
    expect(record.history[0]).toMatchObject({
      action: 'asset.reinstated',
      before: { ownerName: 'Colleague' },
      after: { ownerName: 'Owner' },
    });
  });

  it('comes back without its technical owner if they have left, and unassigned stays so', async () => {
    const org = await organization();
    const { id } = await assets.create(
      org.owner,
      input(org.colleague.id, { ownerId: null, technicalOwnerId: org.colleague.id }),
    );
    await assets.retire(org.owner, id, 'Gone');
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await assets.reinstate(org.owner, id, 'Back in use');

    const record = await assets.get(org.id, id);
    expect(record).toMatchObject({ ownerId: null, technicalOwnerId: null });
    expect(record.history[0]).toMatchObject({
      before: { technicalOwnerName: 'Colleague' },
      after: { technicalOwnerName: null },
    });
  });
});

describe('deleting an asset', () => {
  it('takes it out of the register but keeps it in the Audit trail', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    await assets.delete(org.owner, id, 'Entered twice');

    expect(await assets.list(org.id)).toEqual([]);
    expect(await assets.list(org.id, 'retired')).toEqual([]);
    await expect(assets.get(org.id, id)).rejects.toThrow('does not exist');
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'asset.deleted',
      recordLabel: 'CRM',
      reason: 'Entered twice',
      before: { classification: 'confidential' },
    });
  });

  it('is refused once a risk points at it, even a closed one', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    const ref = await withRisk(org, id);
    await risks.close(org.owner, ref, 'Gone');
    await expect(assets.delete(org.owner, id, 'Mistake')).rejects.toThrow('stays on record');
    expect((await assets.get(org.id, id)).deletable).toBe(false);
  });

  it('is refused once it is retired', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    await assets.retire(org.owner, id, 'Gone');
    await expect(assets.delete(org.owner, id, 'Mistake')).rejects.toThrow('Reinstate');
  });
});

describe('assets', () => {
  it('can be added, and appear in the register', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    expect(await assets.list(org.id)).toEqual([
      expect.objectContaining({
        id,
        name: 'CRM',
        ownerName: 'Owner',
        supplier: null,
        risks: 0,
      }),
    ]);
    expect((await assets.get(org.id, id)).history[0]).toMatchObject({
      action: 'asset.added',
      after: { name: 'CRM', ownerName: 'Owner' },
    });
  });

  it('can be changed, and the Audit trail keeps what they were', async () => {
    const org = await organization();
    const { id } = await assets.create(org.owner, input(org.owner.id));
    await assets.update(org.owner, id, input(org.owner.id, { classification: 'internal' }));
    await assets.update(org.owner, id, input(org.owner.id, { classification: 'internal' }));
    const { history, classification } = await assets.get(org.id, id);
    expect(classification).toBe('internal');
    expect(history.map((event) => event.action)).toEqual(['asset.changed', 'asset.added']);
    expect(history[0]).toMatchObject({
      before: { classification: 'confidential' },
      after: { classification: 'internal' },
    });
  });

  it('keep where they are, who runs them, where the record came from and whether it is checked', async () => {
    const org = await organization();
    const details = {
      status: 'planned' as const,
      technicalOwnerId: org.colleague.id,
      location: 'Frankfurt office, AWS eu-central-1',
      validation: 'validated' as const,
      source: 'IT inventory export, 2026-10',
      notes: 'Replaces the old CRM next year.',
    };
    const { id } = await assets.create(org.owner, input(org.owner.id, details));
    expect(await assets.get(org.id, id)).toMatchObject({
      ...details,
      ownerName: 'Owner',
      technicalOwnerName: 'Colleague',
    });
    expect((await assets.get(org.id, id)).history[0]).toMatchObject({
      after: { status: 'planned', technicalOwnerName: 'Colleague', validation: 'validated' },
    });
  });

  it('can have no owners and no classification yet', async () => {
    const org = await organization();
    const { id } = await assets.create(
      org.owner,
      input(org.owner.id, { ownerId: null, classification: null }),
    );
    expect(await assets.list(org.id)).toEqual([
      expect.objectContaining({
        id,
        ownerId: null,
        ownerName: null,
        technicalOwnerName: null,
        classification: null,
      }),
    ]);
  });

  it('link to the Supplier that provides them', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, supplierInput(org.owner.id));
    const { id } = await assets.create(org.owner, input(org.owner.id, { supplierRef: ref }));
    expect((await assets.get(org.id, id)).supplier).toEqual({ ref, name: 'CRM Ltd' });
    expect((await suppliers.get(org.id, ref)).assets.map((asset) => asset.id)).toEqual([id]);

    await assets.update(org.owner, id, input(org.owner.id));
    expect((await assets.get(org.id, id)).supplier).toBeNull();
  });

  it('refuse a Supplier that has ended', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, supplierInput(org.owner.id));
    await suppliers.end(org.owner, ref, 'Gone');
    await expect(
      assets.create(org.owner, input(org.owner.id, { supplierRef: ref })),
    ).rejects.toThrow('Resume');
  });

  it('stay within the Organization', async () => {
    const a = await organization();
    const b = await organization();
    const { id } = await assets.create(a.owner, input(a.owner.id));
    const { ref } = await suppliers.create(b.owner, supplierInput(b.owner.id));

    expect(await assets.list(b.id)).toEqual([]);
    await expect(assets.get(b.id, id)).rejects.toThrow('does not exist');
    await expect(assets.update(b.owner, id, input(b.owner.id))).rejects.toThrow('does not exist');
    await expect(assets.create(a.owner, input(b.owner.id))).rejects.toThrow('Choose an owner');
    await expect(
      assets.create(a.owner, input(a.owner.id, { technicalOwnerId: b.owner.id })),
    ).rejects.toThrow('Choose an owner');
    await expect(
      assets.create(a.owner, input(a.owner.id, { supplierRef: 'S-99' })),
    ).rejects.toThrow('does not exist');
    expect(ref).toBe('S-01');
  });
});
