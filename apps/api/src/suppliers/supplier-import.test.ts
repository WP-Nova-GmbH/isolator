import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import type { CurrentMember } from '../members/current-member';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { SupplierImportService } from './supplier-import.service';
import { SuppliersService } from './suppliers.service';

const { db, client } = createDb(testDatabaseUrl());
const trail = new AuditTrailService(db);
const { files } = testFiles(db);
const suppliers = new SuppliersService(db, trail, files);
const importer = new SupplierImportService(db, suppliers, trail, files);

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
  return { id: row.id, owner: await addMember(row.id, 'Owner') };
}

const csv = (...lines: string[]) => Buffer.from(lines.join('\n'));

const header =
  'Name,Provides,Owner,Criticality,Handles personal data,Contact,Contract term,Contract ends,Exit plan,Next review';

describe('importing Suppliers', () => {
  it('adds them, reading labels, Yes and No, and German dates', async () => {
    const org = await organization();
    const file = csv(
      header,
      'AWS,Cloud hosting,Owner,High,Ja,aws@example.com,Ends on a date,31.12.2027,Move to Hetzner,2027-06-01',
      'Axonetiq,Runs our AWS,,medium,no,,rolling,,,2027-03-01',
      'Unknowns,,,Unknown,,,,,,2027-01-01',
    );
    expect(await importer.preview(org.id, file)).toMatchObject({ add: 3, refused: 0 });

    await importer.apply(org.owner, file);
    expect(await suppliers.list(org.id)).toMatchObject([
      {
        ref: 'S-01',
        name: 'AWS',
        ownerId: org.owner.id,
        criticality: 'high',
        handlesPersonalData: true,
        contractTerm: 'fixed',
        contractEnds: '2027-12-31',
        exitPlan: 'Move to Hetzner',
        nextReviewOn: '2027-06-01',
      },
      { ref: 'S-02', criticality: 'medium', handlesPersonalData: false, contractTerm: 'rolling' },
      {
        ref: 'S-03',
        ownerId: null,
        criticality: null,
        handlesPersonalData: null,
        contractTerm: null,
      },
    ]);
    expect((await suppliers.get(org.id, 'S-01')).history[0]).toMatchObject({
      action: 'supplier.added',
    });
  });

  it('reads its own export back unchanged, and changes Suppliers by ref', async () => {
    const org = await organization();
    await importer.apply(
      org.owner,
      csv(header, 'AWS,Cloud hosting,Owner,High,Yes,,Ends on a date,2027-12-31,,2027-06-01'),
    );
    const exported = await importer.export(org.id);
    expect(await importer.preview(org.id, Buffer.from(exported))).toMatchObject({ unchanged: 1 });

    // A term that rolls on has no end date, so that goes too.
    const file = csv('Ref,Criticality,Contract term', 's-1,Low,Rolls on until notice');
    expect((await importer.preview(org.id, file)).rows).toEqual([
      {
        row: 2,
        record: 'AWS',
        action: 'change',
        detail: 'Criticality, Contract term, Contract ends',
      },
    ]);
    await importer.apply(org.owner, file);
    expect(await suppliers.get(org.id, 'S-01')).toMatchObject({
      name: 'AWS',
      criticality: 'low',
      contractTerm: 'rolling',
      contractEnds: null,
      handlesPersonalData: true,
    });
  });

  it('refuses rows it can’t import, says why, and then imports nothing', async () => {
    const org = await organization();
    const { ref } = await suppliers.create(org.owner, {
      name: 'Old host',
      provides: '',
      ownerId: null,
      criticality: null,
      handlesPersonalData: null,
      contact: '',
      contractTerm: null,
      contractEnds: null,
      exitPlan: '',
      nextReviewOn: '2099-01-01',
    });
    await suppliers.end(org.owner, ref, 'Moved');
    const file = csv(
      'Ref,Name,Contract term,Contract ends,Handles personal data,Next review',
      ',No review date,,,,',
      ',Fixed without end,Ends on a date,,,2027-01-01',
      ',Bad date,,,,next spring',
      ',Maybe,,,maybe,2027-01-01',
      `${ref},Old host,,,,2027-01-01`,
      'S-07,Unknown,,,,2027-01-01',
    );
    const preview = await importer.preview(org.id, file);
    expect(preview.rows.map((row) => row.detail)).toEqual([
      'Choose the next review date.',
      'Choose when the contract ends.',
      'Next review: write a date such as 2027-03-31, not “next spring”.',
      'Handles personal data: write Yes or No, or leave it empty while it’s unknown.',
      'This Supplier has ended. Resume it before changing it.',
      'No Supplier in the register has this ref. Leave Ref empty to add a Supplier.',
    ]);
    await expect(importer.apply(org.owner, file)).rejects.toThrow('Some rows are refused');
    expect(await suppliers.list(org.id)).toEqual([]);
  });

  it('refuses the same Supplier twice in one file', async () => {
    const org = await organization();
    await importer.apply(org.owner, csv('Name,Next review', 'AWS,2027-01-01'));
    const preview = await importer.preview(
      org.id,
      csv('Ref,Provides', 'S-01,Hosting', 'S-01,Storage'),
    );
    expect(preview.rows.map((row) => row.action)).toEqual(['change', 'refused']);
  });

  it('stays within the Organization', async () => {
    const a = await organization();
    const b = await organization();
    await importer.apply(b.owner, csv('Name,Next review', 'B only,2027-01-01'));

    const preview = await importer.preview(
      a.id,
      csv(
        'Ref,Name,Owner,Next review',
        'S-01,B only,,2027-01-01',
        `,Mine,${b.owner.email},2027-01-01`,
      ),
    );
    expect(preview.rows.map((row) => row.action)).toEqual(['refused', 'refused']);
    expect(await importer.export(a.id)).not.toContain('B only');
  });
});
