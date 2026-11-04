import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { assets, auditEvents, controls, members, organizations, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { MembersService } from '../members/members.service';
import { NonconformitiesService } from '../nonconformities/nonconformities.service';
import { SoaService } from '../soa/soa.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { IncidentsService } from '../incidents/incidents.service';
import { TasksService } from '../tasks/tasks.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { RiskAssessmentsService } from './risk-assessments.service';
import { RiskCriteriaService } from './risk-criteria.service';
import { RisksService, type RiskInput } from './risks.service';

const { db, client } = createDb(testDatabaseUrl());
const criteria = new RiskCriteriaService(db);
const trail = new AuditTrailService(db);
const risks = new RisksService(db, criteria, trail);
const assessments = new RiskAssessmentsService(db, risks, criteria);
const tasks = new TasksService(
  db,
  risks,
  new SuppliersService(db, trail, testFiles(db).files),
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
  const owner = await addMember(row.id, 'Owner');
  const colleague = await addMember(row.id, 'Colleague');
  const [asset] = await db
    .insert(assets)
    .values({ organizationId: row.id, name: 'Laptops', type: 'hardware', ownerId: owner.id })
    .returning();
  return { id: row.id, owner, colleague, asset };
}

function input(ownerId: string, overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    title: 'Laptop lost',
    description: '',
    ownerId,
    likelihood: 3,
    impact: 4,
    residualLikelihood: 2,
    residualImpact: 3,
    treatment: 'mitigate',
    reviewOn: '2027-05-01',
    ...overrides,
  };
}

describe('risk register', () => {
  it('numbers risks per Organization', async () => {
    const a = await organization();
    const b = await organization();
    expect(await risks.create(a.owner, input(a.owner.id))).toEqual({ ref: 'R-01' });
    expect(await risks.create(a.owner, input(a.owner.id))).toEqual({ ref: 'R-02' });
    expect(await risks.create(b.owner, input(b.owner.id))).toEqual({ ref: 'R-01' });
  });

  it('gives each of several new risks its own number', async () => {
    const org = await organization();
    const created = await Promise.all(
      Array.from({ length: 5 }, () => risks.create(org.owner, input(org.owner.id))),
    );
    expect(new Set(created.map((risk) => risk.ref)).size).toBe(5);
  });

  it('keeps every change with the value it replaced', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.colleague, input(org.owner.id));
    await risks.update(org.colleague, ref, input(org.owner.id, { treatment: 'accept' }));
    await risks.update(
      org.colleague,
      ref,
      input(org.owner.id, { treatment: 'accept', title: 'Renamed' }),
    );

    const { history, title } = await risks.get(org.id, ref);
    expect(title).toBe('Renamed');
    expect(history).toHaveLength(3);
    expect(history[1]).toMatchObject({
      action: 'risk.changed',
      memberName: 'Colleague',
      after: { treatment: 'accept' },
      before: { treatment: 'mitigate' },
    });
    expect(history[2]).toMatchObject({ action: 'risk.added', before: null });
  });
});

describe('Confirmations', () => {
  it('only come from the risk owner', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await expect(risks.confirm(org.colleague, ref)).rejects.toThrow('Only Owner');
    expect((await risks.get(org.id, ref)).confirmation).toBeNull();

    await risks.confirm(org.owner, ref);
    expect((await risks.get(org.id, ref)).confirmation).toMatchObject({ by: 'Owner' });
  });

  it('are refused above the threshold without a treatment', async () => {
    const org = await organization();
    const { ref } = await risks.create(
      org.owner,
      input(org.owner.id, { treatment: null, residualLikelihood: null, residualImpact: null }),
    );
    await expect(risks.confirm(org.owner, ref)).rejects.toThrow('Choose a treatment');
  });

  it('follow the Organization’s own threshold', async () => {
    const org = await organization();
    await criteria.save(org.owner, { ...(await criteria.get(org.id)), acceptanceThreshold: 12 });
    const { ref } = await risks.create(
      org.owner,
      input(org.owner.id, { treatment: null, residualLikelihood: null, residualImpact: null }),
    );
    await expect(risks.confirm(org.owner, ref)).resolves.toEqual({ ref });
  });

  it('lapse when the decision changes, and keep the value they replaced', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);

    await risks.update(org.colleague, ref, input(org.owner.id, { residualImpact: 4 }));
    expect((await risks.get(org.id, ref)).confirmation).toBeNull();

    await risks.confirm(org.owner, ref);
    const { history, confirmation } = await risks.get(org.id, ref);
    expect(confirmation).not.toBeNull();
    expect(history[0]).toMatchObject({
      action: 'risk.confirmed',
      after: { residualImpact: 4 },
      before: { residualImpact: 3 },
    });
  });

  it('are not repeated for an unchanged decision', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);
    await expect(risks.confirm(org.owner, ref)).rejects.toThrow('already confirmed');
  });

  it('stay valid when only the owner changes', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);
    await risks.update(org.owner, ref, input(org.colleague.id));
    expect((await risks.get(org.id, ref)).confirmation).not.toBeNull();
  });
});

describe('tenancy', () => {
  it('ignores another Organization’s asset when unlinking', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await risks.create(a.owner, input(a.owner.id));
    await risks.linkAsset(a.owner, ref, a.asset.id);
    await risks.unlinkAsset(a.owner, ref, b.asset.id);
    const { assets: linked, history } = await risks.get(a.id, ref);
    expect(linked).toMatchObject([{ id: a.asset.id }]);
    expect(history[0].action).toBe('risk.asset_linked');
  });

  it('hides one Organization’s risks from another', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await risks.create(a.owner, input(a.owner.id));

    expect(await risks.list(b.id)).toEqual([]);
    await expect(risks.get(b.id, ref)).rejects.toThrow('does not exist');
    await expect(risks.update(b.owner, ref, input(b.owner.id))).rejects.toThrow('does not exist');
    await expect(risks.confirm(b.owner, ref)).rejects.toThrow('does not exist');
    expect((await risks.get(a.id, ref)).ownerName).toBe('Owner');
  });

  it('refuses owners and assets from another Organization', async () => {
    const a = await organization();
    const b = await organization();
    await expect(risks.create(a.owner, input(b.owner.id))).rejects.toThrow('Choose an owner');

    const { ref } = await risks.create(a.owner, input(a.owner.id));
    await expect(risks.linkAsset(a.owner, ref, b.asset.id)).rejects.toThrow('Choose an asset');
    await expect(risks.linkAsset(b.owner, ref, b.asset.id)).rejects.toThrow('does not exist');
  });

  it('keeps Tasks and Risk assessments apart', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await risks.create(a.owner, input(a.owner.id));
    const task = await tasks.create(a.owner, {
      title: 'Encrypt',
      ownerId: a.owner.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    const assessment = await assessments.start(a.owner);

    expect(await tasks.list(b.id)).toEqual([]);
    await expect(tasks.finish(b.owner, task.id)).rejects.toThrow('does not exist');
    await expect(
      tasks.create(b.owner, { title: 'x', ownerId: b.owner.id, dueOn: '2099-01-01', riskRef: ref }),
    ).rejects.toThrow('does not exist');
    expect((await assessments.list(b.id)).assessments).toEqual([]);
    await expect(assessments.complete(b.owner, assessment.id)).rejects.toThrow();
  });
});

describe('closing a risk', () => {
  it('needs the risk owner', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await expect(risks.close(org.colleague, ref, 'Gone')).rejects.toThrow('Only Owner');
  });

  it('moves it out of the register and keeps it on record', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.close(org.owner, ref, 'We sold the laptops');

    expect(await risks.list(org.id)).toEqual([]);
    const [closed] = await risks.list(org.id, 'closed');
    expect(closed).toMatchObject({ ref, closedReason: 'We sold the laptops' });
    expect(closed.closedAt).not.toBeNull();
    expect((await risks.get(org.id, ref)).history[0]).toMatchObject({
      action: 'risk.closed',
      memberName: 'Owner',
      reason: 'We sold the laptops',
    });
  });

  it('freezes the risk until it is reopened', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.close(org.owner, ref, 'Gone');

    await expect(risks.update(org.owner, ref, input(org.owner.id))).rejects.toThrow('Reopen');
    await expect(risks.confirm(org.owner, ref)).rejects.toThrow('Reopen');
    await expect(risks.linkAsset(org.owner, ref, org.asset.id)).rejects.toThrow('Reopen');
    await expect(
      tasks.create(org.owner, { title: 'x', ownerId: org.owner.id, dueOn: '2099-01-01', riskRef: ref }),
    ).rejects.toThrow('Reopen');
  });

  it('is refused while Tasks are open', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    const task = await tasks.create(org.owner, {
      title: 'Encrypt',
      ownerId: org.owner.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    await expect(risks.close(org.owner, ref, 'Gone')).rejects.toThrow('open Task');
    await tasks.finish(org.owner, task.id);
    await expect(risks.close(org.owner, ref, 'Gone')).resolves.toEqual({ ref });
  });

  it('leaves it out of the next Risk assessment', async () => {
    const org = await organization();
    const open = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, open.ref);
    const closed = await risks.create(org.owner, input(org.owner.id));
    await risks.close(org.owner, closed.ref, 'Gone');

    const { id } = await assessments.start(org.owner);
    await assessments.complete(org.owner, id);
    const { register } = await assessments.get(org.id, id);
    expect(register.map((risk) => risk.ref)).toEqual([open.ref]);
  });
});

describe('reopening a risk', () => {
  it('needs the risk owner and a closed risk', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await expect(risks.reopen(org.owner, ref, 'Back')).rejects.toThrow('not closed');
    await risks.close(org.owner, ref, 'Gone');
    await expect(risks.reopen(org.colleague, ref, 'Back')).rejects.toThrow('Only Owner');
  });

  it('asks for a new Confirmation, and that one replaces the last', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);
    await risks.close(org.owner, ref, 'Gone');
    await risks.reopen(org.owner, ref, 'We bought new laptops');

    const reopened = await risks.get(org.id, ref);
    expect(reopened).toMatchObject({ closedAt: null, closedReason: null, confirmation: null });

    await risks.confirm(org.owner, ref);
    const { confirmation, history } = await risks.get(org.id, ref);
    expect(confirmation).not.toBeNull();
    expect(history[0].before).toMatchObject({ treatment: 'mitigate' });
  });

  it('goes to whoever reopens it if its risk owner has left', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.colleague.id));
    await risks.close(org.colleague, ref, 'Gone');
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await risks.reopen(org.owner, ref, 'Back');

    const record = await risks.get(org.id, ref);
    expect(record).toMatchObject({ ownerId: org.owner.id, ownerName: 'Owner' });
    expect(record.history[0]).toMatchObject({
      action: 'risk.reopened',
      before: { ownerName: 'Colleague' },
      after: { ownerName: 'Owner' },
    });
  });
});

describe('deleting a risk', () => {
  it('takes it out of the register but keeps the record in the Audit trail', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.colleague, input(org.owner.id));
    await risks.delete(org.colleague, ref, 'Entered twice');

    expect(await risks.list(org.id)).toEqual([]);
    expect(await risks.list(org.id, 'closed')).toEqual([]);
    await expect(risks.get(org.id, ref)).rejects.toThrow('does not exist');

    const { events } = await trail.list(org.id);
    expect(events[0]).toMatchObject({
      action: 'risk.deleted',
      recordRef: ref,
      recordLabel: 'Laptop lost',
      memberName: 'Colleague',
      reason: 'Entered twice',
      before: { title: 'Laptop lost', ownerName: 'Owner' },
    });
  });

  it('never reuses the number', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.delete(org.owner, ref, 'Mistake');
    expect(await risks.create(org.owner, input(org.owner.id))).toEqual({ ref: 'R-02' });
  });

  it('is refused once there has been a Confirmation, even an outdated one', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);
    await risks.update(org.owner, ref, input(org.owner.id, { impact: 5 }));
    await expect(risks.delete(org.owner, ref, 'Mistake')).rejects.toThrow('stays on record');
  });

  it('is refused while Tasks are open', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await tasks.create(org.owner, {
      title: 'Encrypt',
      ownerId: org.owner.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    await expect(risks.delete(org.owner, ref, 'Mistake')).rejects.toThrow('open Task');
  });

  it('is refused once it is closed', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.close(org.owner, ref, 'Gone');
    await expect(risks.delete(org.owner, ref, 'Mistake')).rejects.toThrow('Reopen');
  });
});

describe('Audit trail', () => {
  it('records who changed what across risks, criteria, assessments and Tasks', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.linkAsset(org.colleague, ref, org.asset.id);
    await risks.unlinkAsset(org.colleague, ref, org.asset.id);
    await criteria.save(org.colleague, {
      ...(await criteria.get(org.id)),
      acceptanceThreshold: 12,
    });
    await risks.confirm(org.owner, ref);
    const { id } = await assessments.start(org.owner);
    await assessments.complete(org.colleague, id);
    const task = await tasks.create(org.colleague, {
      title: 'Encrypt',
      ownerId: org.owner.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    await tasks.finish(org.owner, task.id);

    const { events, total } = await trail.list(org.id);
    expect(total).toBe(9);
    expect(events.map((event) => event.action).reverse()).toEqual([
      'risk.added',
      'risk.asset_linked',
      'risk.asset_unlinked',
      'risk_criteria.changed',
      'risk.confirmed',
      'risk_assessment.started',
      'risk_assessment.completed',
      'task.added',
      'task.finished',
    ]);
    expect(events[5]).toMatchObject({
      before: { acceptanceThreshold: 8 },
      after: { acceptanceThreshold: 12 },
      memberName: 'Colleague',
    });
  });

  it('skips saves that change nothing', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.update(org.owner, ref, input(org.owner.id));
    await criteria.save(org.owner, await criteria.get(org.id));
    expect((await trail.list(org.id)).total).toBe(1);
  });

  it('stays with its Organization', async () => {
    const a = await organization();
    const b = await organization();
    await risks.create(a.owner, input(a.owner.id));
    expect((await trail.list(b.id)).events).toEqual([]);
  });

  it('filters by area and limits how much it returns', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await tasks.create(org.owner, {
      title: 'Encrypt',
      ownerId: org.owner.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    expect((await trail.list(org.id, 'tasks')).events.map((e) => e.action)).toEqual(['task.added']);
    const limited = await trail.list(org.id, undefined, 1);
    expect(limited.events).toHaveLength(1);
    expect(limited.total).toBe(2);
  });

  it('keeps names as they were at the time', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.update(org.owner, ref, input(org.owner.id, { title: 'Renamed' }));
    const { events } = await trail.list(org.id);
    expect(events.map((event) => event.recordLabel)).toEqual(['Renamed', 'Laptop lost']);
  });

  it('can’t be changed or removed', async () => {
    const org = await organization();
    await risks.create(org.owner, input(org.owner.id));
    await expect(
      db.update(auditEvents).set({ memberName: 'Someone else' }).where(eq(auditEvents.organizationId, org.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(auditEvents).where(eq(auditEvents.organizationId, org.id)),
    ).rejects.toThrow();
    await expect(client.unsafe('truncate audit_events')).rejects.toThrow();
    expect((await trail.list(org.id)).total).toBe(1);
  });
});

describe('deleting', () => {
  it('removes an Organization with everything it holds', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);
    const task = await tasks.create(org.owner, {
      title: 'Encrypt',
      ownerId: org.owner.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    await tasks.finish(org.owner, task.id);

    await db.delete(organizations).where(eq(organizations.id, org.id));
    expect(await risks.list(org.id)).toEqual([]);
  });

  it('refuses to remove a Member with history', async () => {
    const org = await organization();
    await risks.create(org.colleague, input(org.owner.id));
    await expect(db.delete(members).where(eq(members.id, org.colleague.id))).rejects.toThrow();
  });
});

describe('links', () => {
  it('adds and removes assets and controls', async () => {
    const org = await organization();
    const [control] = await db.select().from(controls).limit(1);
    const { ref } = await risks.create(org.owner, input(org.owner.id));

    await risks.linkAsset(org.owner, ref, org.asset.id);
    await risks.linkAsset(org.owner, ref, org.asset.id);
    await risks.linkControl(org.owner, ref, control.id);
    let risk = await risks.get(org.id, ref);
    expect(risk.assets.map((asset) => asset.name)).toEqual(['Laptops']);
    expect(risk.controls.map((c) => c.ref)).toEqual([control.ref]);

    await risks.unlinkAsset(org.owner, ref, org.asset.id);
    await risks.unlinkControl(org.owner, ref, control.id);
    risk = await risks.get(org.id, ref);
    expect(risk.assets).toEqual([]);
    expect(risk.controls).toEqual([]);
  });
});

describe('Risk assessments', () => {
  it('can’t complete with an unconfirmed risk', async () => {
    const org = await organization();
    await risks.create(org.owner, input(org.owner.id));
    const { id } = await assessments.start(org.owner);
    await expect(assessments.complete(org.owner, id)).rejects.toThrow('1 risk needs');
  });

  it('allow one in progress at a time', async () => {
    const org = await organization();
    await assessments.start(org.owner);
    await expect(assessments.start(org.owner)).rejects.toThrow('already in progress');
  });

  it('preserve the register as it stood', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);
    const { id } = await assessments.start(org.owner);
    await assessments.complete(org.colleague, id);

    await risks.update(org.owner, ref, input(org.owner.id, { title: 'Later', likelihood: 5 }));

    const completed = await assessments.get(org.id, id);
    expect(completed).toMatchObject({ completedBy: 'Colleague', acceptanceThreshold: 8 });
    expect(completed.register).toHaveLength(1);
    expect(completed.register[0]).toMatchObject({
      ref,
      title: 'Laptop lost',
      likelihood: 3,
      ownerName: 'Owner',
      confirmedBy: 'Owner',
    });
  });

  it('name the next one and set when it is due', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await risks.confirm(org.owner, ref);
    const first = await assessments.start(org.owner);
    await assessments.complete(org.owner, first.id);
    await assessments.start(org.owner);

    const { assessments: rows, nextDue } = await assessments.list(org.id);
    expect(rows.map((row) => row.title).sort()).toEqual(['First Risk assessment', 'Yearly review']);
    expect(nextDue?.slice(0, 4)).toBe(String(new Date().getUTCFullYear() + 1));
  });
});

describe('Tasks', () => {
  it('derive their state from the due date and completion', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    const base = { ownerId: org.owner.id, riskRef: ref };
    const overdue = await tasks.create(org.owner, { ...base, title: 'Late', dueOn: '2000-01-01' });
    await tasks.create(org.owner, { ...base, title: 'Later', dueOn: '2099-01-01' });

    const states = async () =>
      (await tasks.list(org.id, { riskRef: ref })).map((task) => task.state);
    expect(await states()).toEqual(['Overdue', 'Open']);

    await tasks.finish(org.owner, overdue.id);
    expect(await states()).toEqual(['Done', 'Open']);
  });

  it('can only be finished once', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    const { id } = await tasks.create(org.owner, {
      title: 'Encrypt',
      ownerId: org.owner.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    await tasks.finish(org.owner, id);
    await expect(tasks.finish(org.owner, id)).rejects.toThrow('already finished');
  });

  it('show which risk they belong to', async () => {
    const org = await organization();
    const { ref } = await risks.create(org.owner, input(org.owner.id));
    await tasks.create(org.owner, {
      title: 'Encrypt',
      ownerId: org.colleague.id,
      dueOn: '2099-01-01',
      riskRef: ref,
    });
    const [task] = await tasks.list(org.id);
    expect(task).toMatchObject({
      ownerName: 'Colleague',
      belongsTo: { kind: 'risk', ref, title: 'Laptop lost' },
    });
  });
});
