import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import { IncidentsService } from '../incidents/incidents.service';
import type { CurrentMember } from '../members/current-member';
import { MembersService } from '../members/members.service';
import { RiskCriteriaService } from '../risks/risk-criteria.service';
import { RisksService } from '../risks/risks.service';
import { SoaService } from '../soa/soa.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { TasksService } from '../tasks/tasks.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import {
  NonconformitiesService,
  nonconformityInput,
  type NonconformityInput,
} from './nonconformities.service';

const { db, client } = createDb(testDatabaseUrl());
const trail = new AuditTrailService(db);
const risks = new RisksService(db, new RiskCriteriaService(db), trail);
const nonconformities = new NonconformitiesService(db, trail);
const tasks = new TasksService(
  db,
  risks,
  new SuppliersService(db, trail, testFiles(db).files),
  new IncidentsService(db, risks, trail),
  nonconformities,
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

function input(ownerId: string, overrides: Partial<NonconformityInput> = {}): NonconformityInput {
  return {
    title: 'Access reviews were skipped',
    description: '',
    foundIn: 'Internal audit',
    foundOn: '2026-01-15',
    cause: 'Nobody had it in their calendar.',
    ownerId,
    ...overrides,
  };
}

const task = (ownerId: string, nonconformityRef: string) => ({
  title: 'Put it in the calendar',
  ownerId,
  dueOn: '2099-01-01',
  nonconformityRef,
});

describe('Nonconformity register', () => {
  it('numbers records per Organization and never reuses a number', async () => {
    const a = await organization();
    const b = await organization();
    const first = await nonconformities.add(a.owner, input(a.owner.id));
    expect(first).toEqual({ ref: 'NC-001' });
    expect(await nonconformities.add(b.owner, input(b.owner.id))).toEqual({ ref: 'NC-001' });
    await nonconformities.delete(a.owner, first.ref, 'Mistake');
    expect(await nonconformities.add(a.owner, input(a.owner.id))).toEqual({ ref: 'NC-002' });
  });

  it('says what it needs in plain words', () => {
    const parsed = (overrides: object) => {
      const result = nonconformityInput.safeParse({ ...input(randomUUID()), ...overrides });
      return result.error?.issues[0].message;
    };
    expect(parsed({ title: ' ' })).toBe('Say what falls short.');
    expect(parsed({ foundIn: ' ' })).toBe('Say where it was found.');
    expect(parsed({ foundOn: '' })).toBe('Choose when it was found.');
  });

  it('only takes what has already been found', async () => {
    const org = await organization();
    await expect(
      nonconformities.add(org.owner, input(org.owner.id, { foundOn: '2099-01-01' })),
    ).rejects.toThrow('already found');
  });

  it('takes its owner from the Organization’s Members', async () => {
    const org = await organization();
    const other = await organization();
    await expect(
      nonconformities.add(org.owner, input(other.owner.id)),
    ).rejects.toThrow('Choose an owner from your Members');
  });

  it('lists by state, with how many Tasks are still open', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    const { ref: other } = await nonconformities.add(org.owner, input(org.owner.id));
    await tasks.create(org.owner, task(org.owner.id, ref));
    const { id } = await tasks.create(org.owner, task(org.owner.id, ref));
    await tasks.finish(org.owner, id);
    await nonconformities.close(org.owner, other, 'Checked the next quarter’s review ran.');

    const open = await nonconformities.list(org.id, 'open');
    expect(open).toMatchObject([{ ref, state: 'Open', openTasks: 1 }]);
    const closed = await nonconformities.list(org.id, 'closed');
    expect(closed).toMatchObject([{ ref: other, state: 'Closed', closedBy: 'Owner', openTasks: 0 }]);
    expect(await nonconformities.list(org.id)).toHaveLength(2);
  });

  it('keeps every change on the Audit trail', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id, { cause: '' }));
    await nonconformities.update(org.owner, ref, input(org.owner.id));
    await nonconformities.update(org.owner, ref, input(org.owner.id));
    await nonconformities.close(org.colleague, ref, 'The next review ran on time.');
    await nonconformities.reopen(org.owner, ref, 'It slipped again.');

    const record = await nonconformities.get(org.id, ref);
    expect(record.history.map(({ action }) => action)).toEqual([
      'nonconformity.reopened',
      'nonconformity.closed',
      'nonconformity.changed',
      'nonconformity.added',
    ]);
    expect(record.history[2]).toMatchObject({
      before: { cause: '' },
      after: { cause: 'Nobody had it in their calendar.' },
    });
    expect(record.history[1]).toMatchObject({
      memberName: 'Colleague',
      reason: 'The next review ran on time.',
    });
    const { events } = await trail.list(org.id, 'nonconformities');
    expect(events).toHaveLength(4);
  });

  it('keeps Organizations apart', async () => {
    const a = await organization();
    const b = await organization();
    const { ref } = await nonconformities.add(a.owner, input(a.owner.id));
    const missing = 'This Nonconformity does not exist.';
    await expect(nonconformities.get(b.id, ref)).rejects.toThrow(missing);
    await expect(nonconformities.close(b.owner, ref, 'Mine')).rejects.toThrow(missing);
    await expect(nonconformities.delete(b.owner, ref, 'Mine')).rejects.toThrow(missing);
    expect(await nonconformities.list(b.id)).toEqual([]);
    await expect(tasks.list(b.id, { nonconformityRef: ref })).rejects.toThrow(missing);
    await expect(tasks.create(b.owner, task(b.owner.id, ref))).rejects.toThrow(missing);
  });

  it('turns a made-up ref into not found', async () => {
    const org = await organization();
    await expect(nonconformities.get(org.id, 'INC-001')).rejects.toThrow('does not exist');
  });
});

describe('closing a Nonconformity', () => {
  it('needs its cause', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id, { cause: '' }));
    await expect(nonconformities.close(org.owner, ref, 'Fixed')).rejects.toThrow(
      'Save what caused it before closing it.',
    );
    await nonconformities.update(org.owner, ref, input(org.owner.id));
    await expect(nonconformities.close(org.owner, ref, 'Fixed')).resolves.toEqual({ ref });
  });

  it('waits for its Tasks to be finished or cancelled', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    const done = await tasks.create(org.owner, task(org.owner.id, ref));
    const cancelled = await tasks.create(org.owner, task(org.owner.id, ref));
    await expect(nonconformities.close(org.owner, ref, 'Fixed')).rejects.toThrow('2 open Tasks');
    await tasks.finish(org.owner, done.id);
    await tasks.cancel(org.owner, cancelled.id, 'No longer needed');
    await expect(nonconformities.close(org.owner, ref, 'Fixed')).resolves.toEqual({ ref });
  });

  it('freezes it until it is reopened', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    await nonconformities.close(org.owner, ref, 'Fixed');
    const frozen = 'Reopen this Nonconformity to change it.';
    await expect(nonconformities.update(org.owner, ref, input(org.owner.id))).rejects.toThrow(
      frozen,
    );
    await expect(tasks.create(org.owner, task(org.owner.id, ref))).rejects.toThrow(frozen);
    await expect(nonconformities.close(org.owner, ref, 'Again')).rejects.toThrow(frozen);

    await nonconformities.reopen(org.owner, ref, 'It came back.');
    await expect(nonconformities.get(org.id, ref)).resolves.toMatchObject({
      state: 'Open',
      closedAt: null,
      closedBy: null,
      closedReason: null,
    });
    await expect(tasks.create(org.owner, task(org.owner.id, ref))).resolves.toBeDefined();
  });

  it('can only be undone on something closed', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    await expect(nonconformities.reopen(org.owner, ref, 'Why')).rejects.toThrow('not closed');
  });
});

describe('deleting a Nonconformity', () => {
  it('takes a mistake out of the register, but not out of the Audit trail', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    await expect(nonconformities.get(org.id, ref)).resolves.toMatchObject({ deletable: true });
    await nonconformities.delete(org.owner, ref, 'Recorded twice');

    await expect(nonconformities.get(org.id, ref)).rejects.toThrow('does not exist');
    expect(await nonconformities.list(org.id)).toEqual([]);
    const { events } = await trail.list(org.id, 'nonconformities');
    expect(events[0]).toMatchObject({
      action: 'nonconformity.deleted',
      recordRef: ref,
      reason: 'Recorded twice',
    });
  });

  it('is refused once there are Tasks on record, even finished ones', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    const { id } = await tasks.create(org.owner, task(org.owner.id, ref));
    await tasks.finish(org.owner, id);
    await expect(nonconformities.get(org.id, ref)).resolves.toMatchObject({ deletable: false });
    await expect(nonconformities.delete(org.owner, ref, 'Mistake')).rejects.toThrow(
      'Tasks on record',
    );
  });

  it('is refused once it is closed', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    await nonconformities.close(org.owner, ref, 'Fixed');
    await expect(nonconformities.delete(org.owner, ref, 'Mistake')).rejects.toThrow('Reopen');
  });
});

describe('Tasks on a Nonconformity', () => {
  it('belong to it, and link back to it from the Tasks page', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    await tasks.create(org.owner, task(org.owner.id, ref));
    const expected = [
      { belongsTo: { kind: 'nonconformity', ref, title: 'Access reviews were skipped' } },
    ];
    expect(await tasks.list(org.id, { nonconformityRef: ref })).toMatchObject(expected);
    expect(await tasks.list(org.id)).toMatchObject(expected);
  });
});

describe('removing a Member', () => {
  it('waits while they own an open Nonconformity, not a closed one', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.colleague.id));
    await expect(membersService.remove(org.owner, org.colleague.id, 'Left')).rejects.toThrow(
      'Colleague still owns 1 Nonconformity.',
    );
    await nonconformities.close(org.owner, ref, 'Fixed');
    await expect(
      membersService.remove(org.owner, org.colleague.id, 'Left'),
    ).resolves.toBeUndefined();
  });

  it('stops them owning anything new', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.owner.id));
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await expect(
      nonconformities.add(org.owner, input(org.colleague.id)),
    ).rejects.toThrow('Choose an owner');
    await expect(tasks.create(org.owner, task(org.colleague.id, ref))).rejects.toThrow(
      'Choose an owner',
    );
  });

  it('gives a closed Nonconformity to whoever reopens it', async () => {
    const org = await organization();
    const { ref } = await nonconformities.add(org.owner, input(org.colleague.id));
    await nonconformities.close(org.owner, ref, 'Fixed');
    await membersService.remove(org.owner, org.colleague.id, 'Left');
    await nonconformities.reopen(org.owner, ref, 'It came back');

    const record = await nonconformities.get(org.id, ref);
    expect(record).toMatchObject({ ownerId: org.owner.id, ownerName: 'Owner' });
    expect(record.history[0]).toMatchObject({
      action: 'nonconformity.reopened',
      before: { ownerName: 'Colleague' },
      after: { ownerName: 'Owner' },
    });
  });
});
