import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditTrailService } from '../audit/audit-trail';
import { createDb } from '../db/client';
import { members, organizations, users } from '../db/schema';
import type { CurrentMember, Role } from '../members/current-member';
import { SuppliersService } from '../suppliers/suppliers.service';
import { testDatabaseUrl } from '../test/database';
import { testFiles } from '../test/files';
import { AssetImportService } from './asset-import.service';
import { AssetsService } from './assets.service';

const { db, client } = createDb(testDatabaseUrl());
const trail = new AuditTrailService(db);
const { files } = testFiles(db);
const suppliers = new SuppliersService(db, trail, files);
const assets = new AssetsService(db, trail);
const importer = new AssetImportService(db, assets, trail, files);

afterAll(() => client.end());

async function addMember(organizationId: string, name: string, role: Role = 'editor') {
  const [user] = await db
    .insert(users)
    .values({ name, email: `${randomUUID()}@example.com` })
    .returning();
  const [member] = await db
    .insert(members)
    .values({ organizationId, userId: user.id, role })
    .returning();
  return {
    id: member.id,
    organizationId,
    organizationName: 'Test',
    name,
    email: user.email,
    role,
  } satisfies CurrentMember;
}

async function organization() {
  const [row] = await db.insert(organizations).values({ name: 'Test' }).returning();
  return {
    id: row.id,
    owner: await addMember(row.id, 'Owner'),
    colleague: await addMember(row.id, 'Colleague'),
  };
}

function supplier(ownerId: string, name: string) {
  return {
    name,
    provides: '',
    ownerId,
    criticality: null,
    handlesPersonalData: null,
    contact: '',
    contractTerm: null,
    contractEnds: null,
    exitPlan: '',
    nextReviewOn: '2099-01-01',
  };
}

const csv = (...lines: string[]) => Buffer.from(lines.join('\n'));

describe('importing assets', () => {
  it('adds them, finding owners by name or email and Suppliers by ref or name', async () => {
    const org = await organization();
    const aws = await suppliers.create(org.owner, supplier(org.owner.id, 'AWS'));
    await suppliers.create(org.owner, supplier(org.owner.id, 'Axonetiq'));
    const file = csv(
      'Name,Type,Classification,Business owner,Technical owner,Suppliers',
      `AWS infrastructure,Service,Strictly confidential,owner,${org.colleague.email},"${aws.ref}; axonetiq"`,
      'Laptops,hardware,,Unassigned,,',
      ',,,,,',
    );

    const preview = await importer.preview(org.id, file);
    expect(preview).toMatchObject({ add: 2, change: 0, unchanged: 0, refused: 0 });
    expect(preview.rows.map((row) => [row.row, row.record, row.action])).toEqual([
      [2, 'AWS infrastructure', 'add'],
      [3, 'Laptops', 'add'],
    ]);
    expect(await assets.list(org.id)).toEqual([]);

    await importer.apply(org.owner, file);
    const [infrastructure, laptops] = await assets.list(org.id);
    expect(infrastructure).toMatchObject({
      name: 'AWS infrastructure',
      type: 'service',
      status: 'operational',
      classification: 'strictly_confidential',
      ownerId: org.owner.id,
      technicalOwnerId: org.colleague.id,
      validation: 'unvalidated',
      suppliers: [
        { ref: 'S-01', name: 'AWS' },
        { ref: 'S-02', name: 'Axonetiq' },
      ],
    });
    expect(laptops).toMatchObject({ type: 'hardware', classification: null, ownerId: null });
    expect((await assets.get(org.id, laptops.id)).history[0]).toMatchObject({
      action: 'asset.added',
      memberName: 'Owner',
    });
    expect((await suppliers.get(org.id, aws.ref)).history[0]).toMatchObject({
      action: 'supplier.asset_linked',
      after: { asset: 'AWS infrastructure' },
    });
  });

  it('reads its own export back unchanged', async () => {
    const org = await organization();
    await suppliers.create(org.owner, supplier(org.owner.id, 'AWS'));
    await importer.apply(
      org.owner,
      csv(
        'Name,Type,Status,Business owner,Suppliers,Notes',
        'AWS infrastructure,Service,Planned,Owner,S-01,"=1+1, and a ""quote"""',
        'Laptops,Hardware,,,,',
      ),
    );

    const exported = await importer.export(org.id);
    expect(exported).toContain('"S-01 AWS"');
    expect(await importer.preview(org.id, Buffer.from(exported))).toMatchObject({
      add: 0,
      change: 0,
      unchanged: 2,
      refused: 0,
    });
  });

  it('changes only the columns in the file, and links and unlinks Suppliers', async () => {
    const org = await organization();
    await suppliers.create(org.owner, supplier(org.owner.id, 'AWS'));
    await suppliers.create(org.owner, supplier(org.owner.id, 'Axonetiq'));
    await importer.apply(
      org.owner,
      csv('Name,Type,Business owner,Suppliers', 'AWS infrastructure,Service,Owner,S-01'),
    );
    const [{ id }] = await assets.list(org.id);

    const file = csv('ID,Business owner,Suppliers', `${id},Colleague,S-02`);
    const preview = await importer.preview(org.id, file);
    expect(preview.rows).toEqual([
      {
        row: 2,
        record: 'AWS infrastructure',
        action: 'change',
        detail: 'Business owner, Suppliers',
      },
    ]);

    await importer.apply(org.owner, file);
    expect(await assets.get(org.id, id)).toMatchObject({
      name: 'AWS infrastructure',
      type: 'service',
      ownerId: org.colleague.id,
      suppliers: [{ ref: 'S-02', name: 'Axonetiq' }],
    });
    expect((await suppliers.get(org.id, 'S-01')).history[0]).toMatchObject({
      action: 'supplier.asset_unlinked',
    });
  });

  it('refuses rows it can’t import, says why, and then imports nothing', async () => {
    const org = await organization();
    const auditor = await addMember(org.id, 'Auditor', 'auditor');
    const ended = await suppliers.create(org.owner, supplier(org.owner.id, 'Old host'));
    await suppliers.end(org.owner, ended.ref, 'Moved');
    const file = csv(
      'ID,Name,Type,Business owner,Suppliers',
      ',Fine,Software,,',
      ',Cloud thing,Cloud,,',
      ',No type,,,',
      ',Nobody owns it,Software,Nobody,',
      `,Audited,Software,${auditor.email},`,
      ',Old,Service,,Old host',
      ',Unknown supplier,Service,,S-09',
      `${randomUUID()},Gone,Software,,`,
    );

    const preview = await importer.preview(org.id, file);
    expect(preview).toMatchObject({ add: 1, refused: 7 });
    expect(preview.rows.filter((row) => row.action === 'refused').map((row) => row.detail)).toEqual(
      [
        'Type: use Information, Software, Hardware, Service, People or Site, not “Cloud”.',
        'Type: choose Information, Software, Hardware, Service, People or Site.',
        'Business owner: no Member is called “Nobody”. Use a Member’s name or email.',
        'Business owner: Auditor is an Auditor, who can’t own anything.',
        'Suppliers: Old host has ended. Resume it first.',
        'Suppliers: there is no Supplier S-09.',
        'No asset in the register has this ID. Leave ID empty to add an asset.',
      ],
    );

    await expect(importer.apply(org.owner, file)).rejects.toThrow('Some rows are refused');
    expect(await assets.list(org.id)).toEqual([]);
  });

  it('refuses a column the register doesn’t have', async () => {
    const org = await organization();
    await expect(importer.preview(org.id, csv('Name,Colour', 'CRM,Blue'))).rejects.toThrow(
      'The file has a column “Colour” that isn’t in the register.',
    );
    await expect(importer.preview(org.id, csv('Name,Type'))).rejects.toThrow('no rows');
  });

  it('asks for an email when two Members share a name', async () => {
    const org = await organization();
    const twin = await addMember(org.id, 'Owner');
    const preview = await importer.preview(
      org.id,
      csv('Name,Type,Business owner', 'A,Software,Owner', `B,Software,${twin.email}`),
    );
    expect(preview.rows.map((row) => row.detail)).toEqual([
      'Business owner: more than one Member is called “Owner”. Use their email.',
      '',
    ]);
  });

  it('reads semicolon files that German Excel saves in Windows-1252', async () => {
    const org = await organization();
    const file = Buffer.from(
      'Name;Type;Locations\r\nKundendaten;Information;München\r\n',
      'latin1',
    );
    await importer.apply(org.owner, file);
    expect((await assets.list(org.id))[0]).toMatchObject({
      name: 'Kundendaten',
      location: 'München',
    });
  });

  it('stays within the Organization', async () => {
    const a = await organization();
    const b = await organization();
    await suppliers.create(b.owner, supplier(b.owner.id, 'B only'));
    await importer.apply(b.owner, csv('Name,Type', 'B asset,Software'));
    const [bAsset] = await assets.list(b.id);

    const preview = await importer.preview(
      a.id,
      csv(
        'ID,Name,Type,Business owner,Suppliers',
        `${bAsset.id},Taken,Software,,`,
        `,Owned,Software,${b.colleague.email},`,
        ',Supplied,Software,,B only',
        ',Supplied by ref,Software,,S-01',
      ),
    );
    expect(preview.rows.map((row) => row.action)).toEqual([
      'refused',
      'refused',
      'refused',
      'refused',
    ]);
    expect(await importer.export(a.id)).not.toContain('B asset');
  });
});
