import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { createDb } from './client';
import {
  assetSuppliers,
  assets,
  auditEvents,
  controls,
  documents,
  documentVersions,
  evidence,
  incidents,
  members,
  nonconformities,
  organizations,
  riskAssessments,
  riskAssets,
  riskControls,
  riskCriteria,
  risks,
  soaEntries,
  supplierFiles,
  supplierReviews,
  suppliers,
  tasks,
  users,
} from './schema';
import { formatIncidentRef } from '../incidents/incidents.service';
import { formatNonconformityRef } from '../nonconformities/nonconformities.service';
import { formatRiskRef, type RiskDecision, type RiskTreatment } from '../risks/risk-decision';
import { formatSupplierRef } from '../suppliers/supplier-rules';

// Sample Organization for local development. Run after db:seed. Does nothing if it already exists.
const ORGANIZATION = 'WP Nova';

// Anna claimed this install, so she is its Operator. On a Clerk development instance these are
// test addresses: they receive no email, and 424242 is their verification code.
const people: {
  name: string;
  email: string;
  joined: string;
  role: 'administrator' | 'editor' | 'reviewer' | 'auditor';
  isOperator?: boolean;
}[] = [
  {
    name: 'Anna Keller',
    email: 'anna+clerk_test@example.com',
    joined: '2026-07-01',
    role: 'administrator',
    isOperator: true,
  },
  { name: 'Jonas Weber', email: 'jonas+clerk_test@example.com', joined: '2026-07-03', role: 'editor' },
  { name: 'Lea Fischer', email: 'lea+clerk_test@example.com', joined: '2026-08-12', role: 'editor' },
];

const sampleSuppliers = [
  {
    name: 'Microsoft',
    provides: 'Email, files and sign-in',
    owner: 'Jonas Weber',
    criticality: 'high',
    handlesPersonalData: true,
    contact: 'Microsoft 365 admin center, support request',
    contractTerm: 'fixed',
    contractEnds: '2027-03-31',
    exitPlan: 'Export mailboxes and files, then move to another mail host within 30 days.',
    nextReviewOn: '2027-01-15',
    review: {
      reviewedOn: '2026-07-15',
      outcome: 'no_concerns',
      notes: 'Read the current audit reports in the service trust portal. Nothing affects us.',
    },
    files: [
      { kind: 'contract', title: 'Customer agreement', location: 'SharePoint, Legal/Suppliers/Microsoft', datedOn: '2025-04-01', expiresOn: null },
      { kind: 'data_processing_agreement', title: 'Data processing agreement', location: 'SharePoint, Legal/Suppliers/Microsoft', datedOn: '2025-04-01', expiresOn: null },
      { kind: 'certificate', title: 'ISO/IEC 27001 certificate', location: 'Service trust portal', datedOn: '2026-01-10', expiresOn: '2027-01-10' },
    ],
  },
  {
    name: 'Hetzner',
    provides: 'Cloud servers',
    owner: 'Jonas Weber',
    criticality: 'high',
    handlesPersonalData: true,
    contact: 'Hetzner support, abuse and security contact form',
    contractTerm: 'rolling',
    contractEnds: null,
    exitPlan: 'Restore the nightly backups on another provider.',
    nextReviewOn: '2027-02-01',
    review: {
      reviewedOn: '2026-08-01',
      outcome: 'no_concerns',
      notes: 'Checked the certificate and the sub-processor list.',
    },
    files: [
      { kind: 'contract', title: 'Hosting contract', location: 'SharePoint, Legal/Suppliers/Hetzner', datedOn: '2025-02-01', expiresOn: null },
      { kind: 'data_processing_agreement', title: 'Data processing agreement', location: 'SharePoint, Legal/Suppliers/Hetzner', datedOn: '2025-02-01', expiresOn: null },
      { kind: 'certificate', title: 'ISO/IEC 27001 certificate', location: 'SharePoint, Legal/Suppliers/Hetzner', datedOn: '2023-11-20', expiresOn: '2026-11-20' },
    ],
  },
  {
    name: 'GitHub',
    provides: 'Source code hosting',
    owner: 'Jonas Weber',
    criticality: 'medium',
    handlesPersonalData: true,
    contact: 'GitHub support portal',
    contractTerm: 'fixed',
    contractEnds: '2026-12-31',
    exitPlan: '',
    nextReviewOn: '2026-10-15',
    review: {
      reviewedOn: '2025-10-15',
      outcome: 'concerns',
      notes: 'The contract says nothing about deleting our data when it ends.',
    },
    files: [
      { kind: 'contract', title: 'Customer terms', location: 'SharePoint, Legal/Suppliers/GitHub', datedOn: '2024-01-01', expiresOn: null },
    ],
  },
] as const;

const sampleAssets: {
  name: string;
  type: 'information' | 'software' | 'hardware' | 'service' | 'people' | 'site';
  classification: 'public' | 'internal' | 'confidential' | 'strictly_confidential' | null;
  owner: string | null;
  technicalOwner?: string;
  suppliers?: string[];
  status?: 'planned';
  location?: string;
  validated?: boolean;
  source?: string;
}[] = [
  { name: 'Customer data', type: 'information', classification: 'strictly_confidential', owner: 'Anna Keller', technicalOwner: 'Jonas Weber', suppliers: ['Microsoft', 'Hetzner'], location: 'Microsoft 365 and Hetzner servers, Germany', validated: true, source: 'ISMS kick-off workshop' },
  { name: 'Source code', type: 'information', classification: 'confidential', owner: 'Jonas Weber', suppliers: ['GitHub'], validated: true, source: 'ISMS kick-off workshop' },
  { name: 'Microsoft 365', type: 'service', classification: 'confidential', owner: 'Jonas Weber', technicalOwner: 'Jonas Weber', suppliers: ['Microsoft'], location: 'EU data boundary', validated: true, source: 'Licence overview' },
  { name: 'Hetzner cloud servers', type: 'service', classification: 'confidential', owner: 'Jonas Weber', technicalOwner: 'Jonas Weber', suppliers: ['Hetzner'], location: 'Falkenstein, Germany', validated: true, source: 'Hetzner console export' },
  { name: 'Staff laptops', type: 'hardware', classification: 'internal', owner: 'Lea Fischer', technicalOwner: 'Lea Fischer', location: 'Home offices', source: 'Device management export' },
  { name: 'Admin staff', type: 'people', classification: 'internal', owner: 'Anna Keller', validated: true },
  { name: 'Home offices', type: 'site', classification: 'internal', owner: 'Anna Keller' },
  { name: 'Backup storage', type: 'service', classification: null, owner: null, technicalOwner: 'Jonas Weber', status: 'planned', location: 'Second region, not chosen yet', source: 'Restore test, 2026-10' },
];

interface SampleRisk {
  title: string;
  description: string;
  owner: string;
  rating: [number, number];
  residual: [number, number] | null;
  treatment: RiskTreatment | null;
  addedOn: string;
  addedBy: string;
  confirmedOn?: string;
  assets: string[];
  controls: string[];
}

const sampleRisks: SampleRisk[] = [
  {
    title: 'Ransomware encrypts file storage',
    description: 'Malware reaches our servers and encrypts the files customers depend on.',
    owner: 'Jonas Weber',
    rating: [4, 5],
    residual: [2, 4],
    treatment: 'mitigate',
    addedOn: '2026-10-05',
    addedBy: 'Jonas Weber',
    confirmedOn: '2026-10-06',
    assets: ['Customer data', 'Hetzner cloud servers'],
    controls: ['A.8.7', 'A.8.13'],
  },
  {
    title: 'Laptop lost with customer data',
    description: 'A staff member loses a laptop that holds customer data on an unencrypted disk.',
    owner: 'Lea Fischer',
    rating: [3, 4],
    residual: [1, 4],
    treatment: 'mitigate',
    addedOn: '2026-10-05',
    addedBy: 'Lea Fischer',
    confirmedOn: '2026-10-06',
    assets: ['Staff laptops', 'Customer data'],
    controls: ['A.5.15'],
  },
  {
    title: 'Key person leaves with sole admin access',
    description:
      'Only one person holds the admin accounts for our cloud systems. If they leave at short notice, nobody can manage access or recover service.',
    owner: 'Jonas Weber',
    rating: [3, 4],
    residual: [2, 3],
    treatment: 'mitigate',
    addedOn: '2026-10-14',
    addedBy: 'Anna Keller',
    assets: ['Microsoft 365', 'Hetzner cloud servers', 'Admin staff'],
    controls: ['A.5.15', 'A.8.13'],
  },
  {
    title: 'Cloud provider outage stops customer service',
    description: 'Our cloud provider goes down and customers cannot reach the service for hours.',
    owner: 'Anna Keller',
    rating: [2, 4],
    residual: [2, 4],
    treatment: 'accept',
    addedOn: '2026-10-14',
    addedBy: 'Jonas Weber',
    assets: ['Hetzner cloud servers', 'Microsoft 365'],
    controls: ['A.5.23'],
  },
  {
    title: 'Phishing takes over a mailbox',
    description:
      'A staff member enters their password on a fake sign-in page and an attacker reads their mail.',
    owner: 'Lea Fischer',
    rating: [4, 3],
    residual: [2, 3],
    treatment: 'mitigate',
    addedOn: '2026-10-05',
    addedBy: 'Lea Fischer',
    confirmedOn: '2026-10-06',
    assets: ['Microsoft 365', 'Staff laptops'],
    controls: ['A.5.15', 'A.6.3'],
  },
  {
    title: 'Supplier loses our customer data',
    description: 'A company holding our data has a breach and our customers are affected.',
    owner: 'Anna Keller',
    rating: [2, 5],
    residual: null,
    treatment: null,
    addedOn: '2026-10-24',
    addedBy: 'Anna Keller',
    assets: ['Customer data', 'Source code'],
    controls: ['A.5.23'],
  },
];

const sampleSoa: {
  ref?: string;
  own?: { number: number; title: string };
  owner: string;
  applicable?: boolean;
  status: 'not_started' | 'planned' | 'partial' | 'implemented';
  justification: string;
  confirmedOn?: string;
}[] = [
  { ref: 'A.5.1', owner: 'Anna Keller', status: 'implemented', justification: 'Staff and customers need to know the rules we work by.', confirmedOn: '2026-10-02' },
  { ref: 'A.5.15', owner: 'Jonas Weber', status: 'partial', justification: 'We manage access to customer systems and need it limited to the people who use them.' },
  { ref: 'A.5.23', owner: 'Jonas Weber', status: 'planned', justification: 'Our email, files and servers all run on cloud services.' },
  { ref: 'A.6.3', owner: 'Lea Fischer', status: 'not_started', justification: 'Most incidents start with a person, so everyone needs regular training.' },
  { ref: 'A.7.4', owner: 'Anna Keller', applicable: false, status: 'not_started', justification: 'Fully remote team, no premises in scope.', confirmedOn: '2026-09-30' },
  { ref: 'A.8.7', owner: 'Lea Fischer', status: 'implemented', justification: 'Staff laptops handle customer data every day.', confirmedOn: '2026-10-02' },
  { ref: 'A.8.13', owner: 'Lea Fischer', status: 'partial', justification: 'We have to be able to restore customer data after a failure.' },
  { own: { number: 1, title: 'Customer data deleted at contract end' }, owner: 'Anna Keller', status: 'planned', justification: 'Our customer contracts promise it.' },
];

const sampleDocuments: {
  title: string;
  kind: 'scope' | 'policy' | 'interested_parties';
  owner: string;
  versions: { content: string; by: string; on: string; confirmedBy?: string }[];
}[] = [
  {
    title: 'ISMS scope',
    kind: 'scope',
    owner: 'Anna Keller',
    versions: [
      { content: 'What is covered\n\nWP Nova, its staff and its systems.', by: 'Anna Keller', on: '2026-07-01', confirmedBy: 'Anna Keller' },
      {
        content: 'What is covered\n\nWP Nova, its staff and the systems it uses to serve customers.\n\nWhat is not covered\n\nCustomer systems we do not manage.',
        by: 'Anna Keller',
        on: '2026-10-02',
        confirmedBy: 'Anna Keller',
      },
    ],
  },
  {
    title: 'Information security policy',
    kind: 'policy',
    owner: 'Anna Keller',
    versions: [
      {
        content: 'Why we have this policy\n\nCustomers trust us with their data. This policy sets out how we keep it safe.\n\nWhat we expect\n\nEveryone follows the rules in our policies and reports anything that looks wrong.',
        by: 'Anna Keller',
        on: '2026-10-18',
      },
    ],
  },
  {
    title: 'Access control policy',
    kind: 'policy',
    owner: 'Jonas Weber',
    versions: [
      { content: 'Who gets access\n\nPeople get access to the systems their work needs, and no more.', by: 'Jonas Weber', on: '2026-09-30', confirmedBy: 'Anna Keller' },
      {
        content: 'Who gets access\n\nPeople get access to the systems their work needs, and no more. Their manager requests it and the system owner grants it.\n\nReviews\n\nSystem owners review access every quarter and remove what is no longer needed.\n\nLeavers\n\nAccess ends on the last working day.',
        by: 'Jonas Weber',
        on: '2026-10-29',
      },
    ],
  },
  {
    title: 'Interested parties and their requirements',
    kind: 'interested_parties',
    owner: 'Anna Keller',
    versions: [
      {
        content: 'Customers\n\nExpect their data to stay confidential and the service to stay available.\n\nStaff\n\nExpect clear rules and the tools to follow them.',
        by: 'Anna Keller',
        on: '2026-10-16',
      },
    ],
  },
];

const sampleEvidence: {
  ref: string;
  title: string;
  location?: string;
  document?: string;
  datedOn: string;
  expiresOn?: string;
  addedBy: string;
}[] = [
  { ref: 'A.5.15', title: 'Access review, third quarter', location: 'SharePoint, ISMS/Evidence', datedOn: '2026-07-12', expiresOn: '2026-10-12', addedBy: 'Anna Keller' },
  { ref: 'A.5.15', title: 'Access control policy, version 1', document: 'Access control policy', datedOn: '2026-09-30', addedBy: 'Anna Keller' },
  { ref: 'A.8.7', title: 'Malware protection report', location: 'SharePoint, ISMS/Evidence', datedOn: '2026-08-20', expiresOn: '2026-11-20', addedBy: 'Lea Fischer' },
  { ref: 'A.8.7', title: 'Patch status export', location: 'SharePoint, ISMS/Evidence', datedOn: '2026-10-01', expiresOn: '2027-01-01', addedBy: 'Lea Fischer' },
  { ref: 'A.8.13', title: 'Backup job log export', location: 'SharePoint, ISMS/Evidence', datedOn: '2026-10-01', expiresOn: '2027-01-01', addedBy: 'Lea Fischer' },
  { ref: 'A.5.1', title: 'Policy approval meeting notes', location: 'SharePoint, ISMS/Evidence', datedOn: '2026-06-30', addedBy: 'Anna Keller' },
];

const sampleIncidents = [
  {
    number: 2,
    title: 'Admin account signed in from an unknown location',
    description: 'A sign-in alert showed an admin account used from a country we don’t work in.',
    occurredOn: '2026-09-03',
    owner: 'Jonas Weber',
    risk: 5,
    closedOn: '2026-09-11',
    closedReason: 'It was a staff member on holiday, using a travel VPN. No access was misused.',
  },
  {
    number: 3,
    title: 'Staff laptop left on a train, recovered the next day',
    description: 'The laptop was encrypted and locked. Lost property returned it after a day.',
    occurredOn: '2026-10-22',
    owner: 'Lea Fischer',
    risk: 2,
  },
];

const sampleNonconformities = [
  {
    number: 1,
    title: 'Admin sign-ins are not reviewed',
    description: 'Nobody looks at admin sign-ins, so the alert in INC-002 was the first we knew.',
    foundIn: 'Incident INC-002',
    foundOn: '2026-09-11',
    cause: 'Nobody was given the job when the alerts were turned on.',
    owner: 'Jonas Weber',
  },
  {
    number: 2,
    title: 'GitHub contract has no data deletion terms',
    description: 'The contract doesn’t say what happens to our code when the contract ends.',
    foundIn: 'Supplier review of GitHub',
    foundOn: '2026-10-08',
    cause: '',
    owner: 'Anna Keller',
  },
];

const sampleTasks: {
  title: string;
  owner: string;
  dueOn: string;
  risk?: number;
  control?: string;
  supplier?: string;
  incident?: number;
  nonconformity?: number;
  done?: boolean;
}[] = [
  { title: 'Add sign-in alerts for admin accounts', owner: 'Jonas Weber', dueOn: '2026-11-28', nonconformity: 1 },
  { title: 'Turn on multi-factor sign-in for all staff', owner: 'Anna Keller', dueOn: '2026-09-15', risk: 5, done: true },
  { title: 'Test restoring the file storage backup', owner: 'Lea Fischer', dueOn: '2026-10-28', control: 'A.8.13' },
  { title: 'Run the access review for the fourth quarter', owner: 'Anna Keller', dueOn: '2026-10-30', control: 'A.5.15' },
  { title: 'Give a second person admin access', owner: 'Jonas Weber', dueOn: '2026-11-14', risk: 3 },
  { title: 'Encrypt the remaining staff laptops', owner: 'Lea Fischer', dueOn: '2026-11-20', risk: 2 },
  { title: 'Get a data processing agreement from GitHub', owner: 'Anna Keller', dueOn: '2026-11-30', supplier: 'GitHub' },
  { title: 'Check whether anyone tried to sign in to the laptop', owner: 'Lea Fischer', dueOn: '2026-11-07', incident: 3 },
];

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!);
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, ORGANIZATION));
  if (existing) {
    console.log(`${ORGANIZATION} already exists, nothing to do`);
    await client.end();
    return;
  }

  await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name: ORGANIZATION })
      .returning();
    const organizationId = organization.id;

    const memberIds = new Map<string, string>();
    for (const person of people) {
      const [existing] = await tx.select().from(users).where(eq(users.email, person.email));
      const [user] = existing
        ? [existing]
        : await tx
            .insert(users)
            .values({ name: person.name, email: person.email, isOperator: person.isOperator })
            .returning();
      const [member] = await tx
        .insert(members)
        .values({
          organizationId,
          userId: user.id,
          role: person.role,
          createdAt: new Date(person.joined),
        })
        .returning();
      memberIds.set(person.name, member.id);
    }
    const memberId = (name: string) => memberIds.get(name)!;

    await tx.insert(riskCriteria).values({
      organizationId,
      acceptanceThreshold: 8,
      likelihoodLevels: [
        'Less than once in ten years',
        'Once in five to ten years',
        'Once in two to five years',
        'About once a year',
        'Several times a year',
      ],
      impactLevels: [
        'No customer notices',
        'Internal disruption for a day',
        'One customer affected',
        'Several customers or a reportable breach',
        'Threatens the business',
      ],
    });

    const supplierIds = new Map<string, string>();
    for (const [index, sample] of sampleSuppliers.entries()) {
      const { files, review, owner, ...fields } = sample;
      const [supplier] = await tx
        .insert(suppliers)
        .values({ ...fields, organizationId, number: index + 1, ownerId: memberId(owner) })
        .returning();
      supplierIds.set(sample.name, supplier.id);
      const record = {
        organizationId,
        recordType: 'supplier' as const,
        recordId: supplier.id,
        recordRef: formatSupplierRef(supplier.number),
        recordLabel: supplier.name,
        memberId: memberId(owner),
        memberName: owner,
      };
      await tx.insert(auditEvents).values({
        ...record,
        action: 'supplier.added',
        after: { ...fields, ownerName: owner },
        occurredAt: new Date('2026-07-01'),
      });
      await tx.insert(supplierFiles).values(
        files.map((file) => ({ ...file, organizationId, supplierId: supplier.id })),
      );
      await tx.insert(auditEvents).values(
        files.map((file) => ({
          ...record,
          action: 'supplier.file_added' as const,
          after: { ...file },
          occurredAt: new Date('2026-07-01'),
        })),
      );
      await tx.insert(supplierReviews).values({
        ...review,
        organizationId,
        supplierId: supplier.id,
        reviewerId: memberId(owner),
        nextReviewOn: sample.nextReviewOn,
      });
      await tx.insert(auditEvents).values({
        ...record,
        action: 'supplier.reviewed',
        after: { ...review, nextReviewOn: sample.nextReviewOn },
        occurredAt: new Date(review.reviewedOn),
      });
    }

    const insertedAssets = await tx
      .insert(assets)
      .values(
        sampleAssets.map((asset) => ({
          name: asset.name,
          type: asset.type,
          status: asset.status ?? ('operational' as const),
          classification: asset.classification,
          ownerId: asset.owner ? memberId(asset.owner) : null,
          technicalOwnerId: asset.technicalOwner ? memberId(asset.technicalOwner) : null,
          location: asset.location ?? '',
          validation: asset.validated ? ('validated' as const) : ('unvalidated' as const),
          source: asset.source ?? '',
          organizationId,
        })),
      )
      .returning();
    const assetId = (name: string) => insertedAssets.find((asset) => asset.name === name)!.id;
    await tx.insert(assetSuppliers).values(
      sampleAssets.flatMap((asset) =>
        (asset.suppliers ?? []).map((supplier) => ({
          organizationId,
          assetId: assetId(asset.name),
          supplierId: supplierIds.get(supplier)!,
        })),
      ),
    );

    const catalog = await tx
      .select({ id: controls.id, ref: controls.ref })
      .from(controls)
      .where(
        inArray(controls.ref, ['A.5.15', 'A.5.23', 'A.6.3', 'A.8.7', 'A.8.13']),
      );
    const controlId = (ref: string) => catalog.find((control) => control.ref === ref)!.id;

    const riskIds: string[] = [];
    for (const [index, sample] of sampleRisks.entries()) {
      const decision: RiskDecision = {
        likelihood: sample.rating[0],
        impact: sample.rating[1],
        residualLikelihood: sample.residual?.[0] ?? null,
        residualImpact: sample.residual?.[1] ?? null,
        treatment: sample.treatment,
      };
      const [risk] = await tx
        .insert(risks)
        .values({
          organizationId,
          number: index + 1,
          title: sample.title,
          description: sample.description,
          ownerId: memberId(sample.owner),
          reviewOn: '2027-05-01',
          ...decision,
        })
        .returning();
      riskIds.push(risk.id);
      const record = {
        organizationId,
        recordType: 'risk' as const,
        recordId: risk.id,
        recordRef: formatRiskRef(risk.number),
        recordLabel: risk.title,
      };
      await tx.insert(auditEvents).values({
        ...record,
        memberId: memberId(sample.addedBy),
        memberName: sample.addedBy,
        action: 'risk.added',
        after: {
          title: risk.title,
          description: risk.description,
          ownerName: sample.owner,
          ...decision,
          reviewOn: risk.reviewOn,
        },
        occurredAt: new Date(sample.addedOn),
      });
      if (sample.confirmedOn) {
        await tx.insert(auditEvents).values({
          ...record,
          memberId: memberId(sample.owner),
          memberName: sample.owner,
          action: 'risk.confirmed',
          after: { ...decision },
          occurredAt: new Date(sample.confirmedOn),
        });
      }
      await tx.insert(riskAssets).values(
        sample.assets.map((name) => ({ organizationId, riskId: risk.id, assetId: assetId(name) })),
      );
      await tx.insert(riskControls).values(
        sample.controls.map((ref) => ({ organizationId, riskId: risk.id, controlId: controlId(ref) })),
      );
    }

    const catalogIds = await tx.select({ id: controls.id, ref: controls.ref }).from(controls);
    await tx
      .insert(soaEntries)
      .values(catalogIds.map((control) => ({ organizationId, controlId: control.id })));
    const entries = await tx
      .select({ id: soaEntries.id, ref: controls.ref })
      .from(soaEntries)
      .innerJoin(controls, eq(controls.id, soaEntries.controlId))
      .where(eq(soaEntries.organizationId, organizationId));
    const entryIds = new Map(entries.map((entry) => [entry.ref, entry.id]));

    for (const sample of sampleSoa) {
      const decision = {
        applicable: sample.applicable ?? true,
        status: sample.status,
        justification: sample.justification,
      };
      const values = { ...decision, ownerId: memberId(sample.owner) };
      const [entry] = sample.own
        ? await tx
            .insert(soaEntries)
            .values({
              ...values,
              organizationId,
              ownNumber: sample.own.number,
              ownTitle: sample.own.title,
            })
            .returning()
        : await tx
            .update(soaEntries)
            .set(values)
            .where(eq(soaEntries.id, entryIds.get(sample.ref!)!))
            .returning();
      const ref = sample.ref ?? `OWN-${sample.own!.number}`;
      entryIds.set(ref, entry.id);
      if (sample.confirmedOn) {
        await tx.insert(auditEvents).values({
          organizationId,
          recordType: 'soa_entry',
          recordId: entry.id,
          recordRef: ref,
          recordLabel: sample.own?.title ?? ref,
          memberId: memberId('Anna Keller'),
          memberName: 'Anna Keller',
          action: 'soa.confirmed',
          after: decision,
          occurredAt: new Date(sample.confirmedOn),
        });
      }
    }

    const documentIds = new Map<string, string>();
    for (const sample of sampleDocuments) {
      const [document] = await tx
        .insert(documents)
        .values({
          organizationId,
          title: sample.title,
          kind: sample.kind,
          ownerId: memberId(sample.owner),
        })
        .returning();
      documentIds.set(sample.title, document.id);
      const record = {
        organizationId,
        recordType: 'document' as const,
        recordId: document.id,
        recordLabel: document.title,
      };
      for (const [index, version] of sample.versions.entries()) {
        const number = index + 1;
        await tx.insert(documentVersions).values({
          organizationId,
          documentId: document.id,
          version: number,
          content: version.content,
          createdById: memberId(version.by),
          createdAt: new Date(version.on),
          confirmedAt: version.confirmedBy ? new Date(version.on) : null,
          confirmedById: version.confirmedBy ? memberId(version.confirmedBy) : null,
        });
        await tx.insert(auditEvents).values({
          ...record,
          memberId: memberId(version.by),
          memberName: version.by,
          action: number === 1 ? 'document.added' : 'document.version_started',
          after:
            number === 1
              ? { title: sample.title, kind: sample.kind, ownerName: sample.owner, version: 1 }
              : { version: number },
          occurredAt: new Date(version.on),
        });
        if (version.confirmedBy) {
          await tx.insert(auditEvents).values({
            ...record,
            memberId: memberId(version.confirmedBy),
            memberName: version.confirmedBy,
            action: 'document.confirmed',
            after: { version: number, content: version.content },
            occurredAt: new Date(version.on),
          });
        }
      }
    }

    for (const sample of sampleEvidence) {
      await tx.insert(evidence).values({
        organizationId,
        soaEntryId: entryIds.get(sample.ref)!,
        title: sample.title,
        location: sample.location ?? null,
        documentId: sample.document ? documentIds.get(sample.document) : null,
        datedOn: sample.datedOn,
        expiresOn: sample.expiresOn ?? null,
        addedById: memberId(sample.addedBy),
      });
    }

    const incidentIds = new Map<number, string>();
    for (const sample of sampleIncidents) {
      const [incident] = await tx
        .insert(incidents)
        .values({
          organizationId,
          number: sample.number,
          title: sample.title,
          description: sample.description,
          occurredOn: sample.occurredOn,
          ownerId: memberId(sample.owner),
          riskId: riskIds[sample.risk - 1],
          closedAt: sample.closedOn ? new Date(sample.closedOn) : null,
          closedById: sample.closedOn ? memberId(sample.owner) : null,
          closedReason: sample.closedReason,
        })
        .returning();
      incidentIds.set(sample.number, incident.id);
      const record = {
        organizationId,
        recordType: 'incident' as const,
        recordId: incident.id,
        recordRef: formatIncidentRef(incident.number),
        recordLabel: incident.title,
        memberId: memberId(sample.owner),
        memberName: sample.owner,
      };
      await tx.insert(auditEvents).values({
        ...record,
        action: 'incident.reported',
        after: {
          title: incident.title,
          description: incident.description,
          occurredOn: incident.occurredOn,
          ownerName: sample.owner,
          riskRef: formatRiskRef(sample.risk),
        },
        occurredAt: new Date(sample.occurredOn),
      });
      if (sample.closedOn) {
        await tx.insert(auditEvents).values({
          ...record,
          action: 'incident.closed',
          reason: sample.closedReason,
          occurredAt: new Date(sample.closedOn),
        });
      }
    }

    const nonconformityIds = new Map<number, string>();
    for (const { owner, ...sample } of sampleNonconformities) {
      const [nonconformity] = await tx
        .insert(nonconformities)
        .values({ ...sample, organizationId, ownerId: memberId(owner) })
        .returning();
      nonconformityIds.set(sample.number, nonconformity.id);
      await tx.insert(auditEvents).values({
        organizationId,
        recordType: 'nonconformity',
        recordId: nonconformity.id,
        recordRef: formatNonconformityRef(nonconformity.number),
        recordLabel: nonconformity.title,
        memberId: memberId(owner),
        memberName: owner,
        action: 'nonconformity.added',
        after: {
          title: sample.title,
          description: sample.description,
          foundIn: sample.foundIn,
          foundOn: sample.foundOn,
          cause: sample.cause,
          ownerName: owner,
        },
        occurredAt: new Date(sample.foundOn),
      });
    }

    await tx.insert(tasks).values(
      sampleTasks.map((task) => ({
        organizationId,
        title: task.title,
        ownerId: memberId(task.owner),
        dueOn: task.dueOn,
        doneAt: task.done ? new Date(task.dueOn) : null,
        riskId: task.risk ? riskIds[task.risk - 1] : null,
        soaEntryId: task.control ? entryIds.get(task.control) : null,
        supplierId: task.supplier ? supplierIds.get(task.supplier) : null,
        incidentId: task.incident ? incidentIds.get(task.incident) : null,
        nonconformityId: task.nonconformity ? nonconformityIds.get(task.nonconformity) : null,
      })),
    );

    await tx.insert(riskAssessments).values({
      organizationId,
      title: 'First Risk assessment',
      startedOn: '2026-11-01',
    });
  });

  await client.end();
  console.log(`Seeded ${ORGANIZATION} with ${sampleRisks.length} risks`);
}

void main();
