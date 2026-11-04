import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import { IncidentsService } from '../incidents/incidents.service';
import type { CurrentMember } from '../members/current-member';
import { NonconformitiesService } from '../nonconformities/nonconformities.service';
import { RiskCriteriaService } from '../risks/risk-criteria.service';
import { RisksService } from '../risks/risks.service';
import { SoaService } from '../soa/soa.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { commitmentInput, taskInput, TasksService } from './tasks.service';

const { db, client } = createDb(testDatabaseUrl());
const trail = new AuditTrailService(db);
const risks = new RisksService(db, new RiskCriteriaService(db), trail);
const tasks = new TasksService(
  db,
  risks,
  new SuppliersService(db, trail, testFiles(db).files),
  new IncidentsService(db, risks, trail),
  new NonconformitiesService(db, trail),
  new SoaService(db, trail),
);

afterAll(() => client.end());

async function addMember(organizationId: string, name: string): Promise<CurrentMember> {
  const [user] = await db
    .insert(users)
    .values({ name, email: `${randomUUID()}@example.com` })
    .returning();
  const [member] = await db
    .insert(members)
    .values({ organizationId, userId: user.id, role: 'editor' })
    .returning();
  return {
    id: member.id,
    organizationId,
    organizationName: 'Test',
    name,
    email: user.email,
    role: 'editor',
  };
}

async function withRisk() {
  const [row] = await db.insert(organizations).values({ name: 'Test' }).returning();
  const owner = await addMember(row.id, 'Owner');
  const { ref } = await risks.create(owner, {
    title: 'Laptop theft',
    description: '',
    ownerId: owner.id,
    likelihood: 3,
    impact: 4,
    residualLikelihood: null,
    residualImpact: null,
    treatment: 'mitigate',
    reviewOn: '2099-01-01',
  });
  return { id: row.id, owner, ref };
}

const proposal = (riskRef: string) => ({
  title: 'Encrypt the laptops',
  proposed: true,
  ownerId: null,
  dueOn: null,
  riskRef,
});

describe('proposed Tasks', () => {
  it('can be recorded before anyone has agreed who does them or by when', async () => {
    const org = await withRisk();
    const { id } = await tasks.create(org.owner, proposal(org.ref));
    expect(await tasks.list(org.id, { riskRef: org.ref })).toEqual([
      expect.objectContaining({ id, state: 'Proposed', ownerId: null, ownerName: null, dueOn: null }),
    ]);
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'task.added',
      after: { proposed: true, ownerName: null, dueOn: null },
    });
  });

  it('can’t be marked done until someone commits to them', async () => {
    const org = await withRisk();
    const { id } = await tasks.create(org.owner, proposal(org.ref));
    await expect(tasks.finish(org.owner, id)).rejects.toThrow('Commit to this Task first');

    await tasks.commit(org.owner, id, { ownerId: org.owner.id, dueOn: '2099-03-01' });
    expect(await tasks.list(org.id)).toEqual([
      expect.objectContaining({ id, state: 'Open', ownerName: 'Owner', dueOn: '2099-03-01' }),
    ]);
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'task.committed',
      after: { ownerName: 'Owner', dueOn: '2099-03-01' },
    });
    await expect(
      tasks.commit(org.owner, id, { ownerId: org.owner.id, dueOn: '2099-03-01' }),
    ).rejects.toThrow('already committed');
    await tasks.finish(org.owner, id);
    expect((await tasks.list(org.id))[0].state).toBe('Done');
  });

  it('can be turned down, which cancels them with a reason', async () => {
    const org = await withRisk();
    const { id } = await tasks.create(org.owner, proposal(org.ref));
    await tasks.cancel(org.owner, id, 'Laptops are being replaced instead');
    expect((await tasks.list(org.id))[0]).toMatchObject({
      state: 'Cancelled',
      cancelledReason: 'Laptops are being replaced instead',
    });
    await expect(
      tasks.commit(org.owner, id, { ownerId: org.owner.id, dueOn: '2099-03-01' }),
    ).rejects.toThrow('already finished');
  });

  it('keep a record open until they are done or turned down', async () => {
    const org = await withRisk();
    await tasks.create(org.owner, proposal(org.ref));
    await expect(risks.close(org.owner, org.ref, 'Gone')).rejects.toThrow('open Task');
  });

  it('need an owner and a due date to commit, from your own Members', async () => {
    const org = await withRisk();
    const other = await withRisk();
    const { id } = await tasks.create(org.owner, proposal(org.ref));
    expect(commitmentInput.safeParse({ ownerId: org.owner.id }).success).toBe(false);
    await expect(
      tasks.commit(org.owner, id, { ownerId: other.owner.id, dueOn: '2099-03-01' }),
    ).rejects.toThrow('Choose an owner');
    await expect(
      tasks.commit(other.owner, id, { ownerId: other.owner.id, dueOn: '2099-03-01' }),
    ).rejects.toThrow('does not exist');
  });
});

describe('Task input', () => {
  const base = { title: 'Encrypt the laptops', riskRef: 'R-01' };

  it('needs an owner and a due date unless the Task is only proposed', () => {
    const missing = taskInput.safeParse({ ...base, ownerId: null, dueOn: '2099-01-01' });
    expect(missing.error?.issues[0].message).toBe('Choose an owner.');
    const undated = taskInput.safeParse({ ...base, ownerId: randomUUID(), dueOn: null });
    expect(undated.error?.issues[0].message).toBe('Choose a due date.');
    const proposed = taskInput.safeParse({ ...base, proposed: true, ownerId: null, dueOn: null });
    expect(proposed.success).toBe(true);
  });
});
