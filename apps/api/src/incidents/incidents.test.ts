import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { MembersService } from '../members/members.service';
import { NonconformitiesService } from '../nonconformities/nonconformities.service';
import { RiskCriteriaService } from '../risks/risk-criteria.service';
import { RisksService } from '../risks/risks.service';
import { SoaService } from '../soa/soa.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { taskInput, TasksService } from '../tasks/tasks.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { IncidentsService, type IncidentInput } from './incidents.service';

const { db, client } = createDb(testDatabaseUrl());
const trail = new AuditTrailService(db);
const risks = new RisksService(db, new RiskCriteriaService(db), trail);
const incidents = new IncidentsService(db, risks, trail);
const tasks = new TasksService(
  db,
  risks,
  new SuppliersService(db, trail, testFiles(db).files),
  incidents,
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

function input(ownerId: string, overrides: Partial<IncidentInput> = {}): IncidentInput {
  return {
    title: 'Laptop stolen',
    description: '',
    occurredOn: '2026-01-15',
    ownerId,
    riskRef: null,
    ...overrides,
  };
}

const task = (ownerId: string, incidentRef: string) => ({
  title: 'Wipe it remotely',
  ownerId,
  dueOn: '2099-01-01',
  incidentRef,
});

describe('Incident register', () => {
  it('numbers Incidents per Organization and never reuses a number', async () => {
    const a = await organization();
    const b = await organization();
    const first = await incidents.report(a.owner, input(a.owner.id));
    expect(first).toEqual({ ref: 'INC-001' });
    expect(await incidents.report(b.owner, input(b.owner.id))).toEqual({ ref: 'INC-001' });
    await incidents.delete(a.owner, first.ref, 'Mistake');
    expect(await incidents.report(a.owner, input(a.owner.id))).toEqual({ ref: 'INC-002' });
  });

  it('only takes things that have already happened', async () => {
    const org = await organization();
    await expect(
      incidents.report(org.owner, input(org.owner.id, { occurredOn: '2099-01-01' })),
    ).rejects.toThrow('already happened');
  });

  it('links to the risk it is an example of', async () => {
    const org = await organization();
    const { ref: riskRef } = await risks.create(org.owner, {
      title: 'Laptop lost',
      description: '',
      ownerId: org.owner.id,
      likelihood: 2,
      impact: 3,
      residualLikelihood: null,
      residualImpact: null,
      treatment: null,
      reviewOn: '2099-01-01',
    });
    const { ref } = await incidents.report(org.owner, input(org.owner.id, { riskRef }));
    expect((await incidents.get(org.id, ref)).risk).toEqual({ ref: riskRef, title: 'Laptop lost' });
  });

  it('records changes in the Audit trail', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    await incidents.update(org.colleague, ref, input(org.owner.id, { title: 'Laptop found' }));
    await incidents.update(org.colleague, ref, input(org.owner.id, { title: 'Laptop found' }));
    const { history } = await incidents.get(org.id, ref);
    expect(history.map((event) => event.action)).toEqual(['incident.changed', 'incident.reported']);
    expect(history[0]).toMatchObject({
      memberName: 'Colleague',
      before: { title: 'Laptop stolen' },
      after: { title: 'Laptop found' },
    });
  });
});

describe('closing an Incident', () => {
  it('keeps who closed it and why, and filters it into Closed', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    await incidents.close(org.colleague, ref, 'Recovered, nothing was accessed');

    expect(await incidents.list(org.id, 'open')).toEqual([]);
    const [closed] = await incidents.list(org.id, 'closed');
    expect(closed).toMatchObject({
      ref,
      state: 'Closed',
      closedBy: 'Colleague',
      closedReason: 'Recovered, nothing was accessed',
    });
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'incident.closed',
      reason: 'Recovered, nothing was accessed',
    });
  });

  it('freezes it until it is reopened', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    await incidents.close(org.owner, ref, 'Done');
    await expect(incidents.update(org.owner, ref, input(org.owner.id))).rejects.toThrow('Reopen');
    await expect(tasks.create(org.owner, task(org.owner.id, ref))).rejects.toThrow('Reopen');

    await incidents.reopen(org.colleague, ref, 'It came back');
    expect(await incidents.get(org.id, ref)).toMatchObject({
      state: 'Investigating',
      closedBy: null,
      closedReason: null,
    });
  });

  it('is refused while Tasks are open, and a cancelled Task doesn’t count', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    const { id } = await tasks.create(org.owner, task(org.owner.id, ref));
    await expect(incidents.close(org.owner, ref, 'Done')).rejects.toThrow('open Task');
    await tasks.cancel(org.owner, id, 'No longer needed');
    await expect(incidents.close(org.owner, ref, 'Done')).resolves.toEqual({ ref });
  });

  it('goes to whoever reopens it if its owner has left', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.colleague.id));
    await incidents.close(org.owner, ref, 'Done');
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await incidents.reopen(org.owner, ref, 'It came back');

    const record = await incidents.get(org.id, ref);
    expect(record).toMatchObject({ ownerId: org.owner.id, ownerName: 'Owner' });
    expect(record.history[0]).toMatchObject({
      action: 'incident.reopened',
      before: { ownerName: 'Colleague' },
      after: { ownerName: 'Owner' },
    });
  });
});

describe('deleting an Incident', () => {
  it('takes it out of the register but keeps it in the Audit trail', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    await incidents.delete(org.colleague, ref, 'Reported twice');
    expect(await incidents.list(org.id)).toEqual([]);
    await expect(incidents.get(org.id, ref)).rejects.toThrow('does not exist');
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'incident.deleted',
      recordLabel: 'Laptop stolen',
      reason: 'Reported twice',
    });
  });

  it('is refused once there are Tasks on record, even finished ones', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    const { id } = await tasks.create(org.owner, task(org.owner.id, ref));
    await tasks.finish(org.owner, id);
    await expect(incidents.delete(org.owner, ref, 'Mistake')).rejects.toThrow('stays');
    expect((await incidents.get(org.id, ref)).deletable).toBe(false);
  });

  it('is refused once it is closed', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    await incidents.close(org.owner, ref, 'Done');
    await expect(incidents.delete(org.owner, ref, 'Mistake')).rejects.toThrow('Reopen');
  });
});

describe('Tasks on an Incident', () => {
  it('show which Incident they belong to', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    await tasks.create(org.colleague, task(org.colleague.id, ref));
    const [listed] = await tasks.list(org.id, { incidentRef: ref });
    expect(listed).toMatchObject({
      ownerName: 'Colleague',
      belongsTo: { kind: 'incident', ref, title: 'Laptop stolen' },
    });
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'task.added',
      recordRef: ref,
    });
  });

  it('need exactly one record to belong to', () => {
    const base = { title: 'x', ownerId: randomUUID(), dueOn: '2099-01-01' };
    expect(taskInput.safeParse({ ...base, incidentRef: 'INC-001' }).success).toBe(true);
    expect(taskInput.safeParse({ ...base, incidentRef: 'INC-001', riskRef: 'R-01' }).success).toBe(false);
  });
});

describe('cancelling a Task', () => {
  it('keeps it on record with the reason', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    const { id } = await tasks.create(org.owner, task(org.owner.id, ref));
    await tasks.cancel(org.colleague, id, 'The laptop was found');

    const [listed] = await tasks.list(org.id);
    expect(listed).toMatchObject({ state: 'Cancelled', cancelledReason: 'The laptop was found' });
    expect((await trail.list(org.id)).events[0]).toMatchObject({
      action: 'task.cancelled',
      memberName: 'Colleague',
      reason: 'The laptop was found',
    });
  });

  it('is refused once a Task is finished, and a cancelled Task can’t be finished', async () => {
    const org = await organization();
    const { ref } = await incidents.report(org.owner, input(org.owner.id));
    const done = await tasks.create(org.owner, task(org.owner.id, ref));
    await tasks.finish(org.owner, done.id);
    await expect(tasks.cancel(org.owner, done.id, 'x')).rejects.toThrow('already finished');

    const cancelled = await tasks.create(org.owner, task(org.owner.id, ref));
    await tasks.cancel(org.owner, cancelled.id, 'x');
    await expect(tasks.cancel(org.owner, cancelled.id, 'x')).rejects.toThrow('already finished');
    await expect(tasks.finish(org.owner, cancelled.id)).rejects.toThrow('already finished');
  });

  it('stays within the Organization', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await incidents.report(a.owner, input(a.owner.id));
    const { id } = await tasks.create(a.owner, task(a.owner.id, ref));
    await expect(tasks.cancel(b.owner, id, 'x')).rejects.toThrow('does not exist');
  });
});

describe('tenancy', () => {
  it('keeps one Organization’s Incidents from another', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await incidents.report(a.owner, input(a.owner.id));
    expect(await incidents.list(b.id)).toEqual([]);
    await expect(incidents.get(b.id, ref)).rejects.toThrow('does not exist');
    await expect(incidents.close(b.owner, ref, 'x')).rejects.toThrow('does not exist');
    await expect(tasks.create(b.owner, task(b.owner.id, ref))).rejects.toThrow('does not exist');
    await expect(incidents.report(a.owner, input(b.owner.id))).rejects.toThrow('Choose an owner');
    await expect(
      incidents.report(a.owner, input(a.owner.id, { riskRef: 'R-99' })),
    ).rejects.toThrow('does not exist');
  });
});
