import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AuditAction, AuditRecordType, AuditValue } from '../audit/audit-trail';
import type { RegisterEntry } from '../risks/risk-decision';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Tenant. Every customer-owned row hangs off an organization.
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Free-text ISMS scope statement (ISO 27001 clause 4.3).
  ismsScope: text('isms_scope'),
  ...timestamps,
});

// A person. The same person can be a Member of several Organizations.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Clerk holds sign-in. Empty until someone added before Clerk first signs in.
    clerkUserId: text('clerk_user_id').unique(),
    name: text('name').notNull(),
    // A copy of what Clerk has, which is what keeps addresses unique.
    email: text('email').notNull(),
    isOperator: boolean('is_operator').notNull().default(false),
    ...timestamps,
  },
  // An install has one Operator: the person who claimed it.
  (t) => [uniqueIndex('users_one_operator_idx').on(t.isOperator).where(sql`is_operator`)],
);

// A Clerk session Isolator has seen, and which of a person's Organizations it is working in.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  activeOrganizationId: uuid('active_organization_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
});

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // A removed Member can't reach the Organization, and stays on record in its history.
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedReason: text('removed_reason'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('members_org_user_idx').on(t.organizationId, t.userId),
    unique('members_org_id_unique').on(t.organizationId, t.id),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    // The link holds the token; only its hash is kept, so the table alone lets nobody in.
    tokenHash: text('token_hash').notNull().unique(),
    invitedByName: text('invited_by_name').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invitations_open_email_idx')
      .on(t.organizationId, t.email)
      .where(sql`accepted_at is null`),
  ],
);

export const fileStorageDriver = pgEnum('file_storage_driver', ['local', 's3']);

// One uploaded file. The bytes live with `driver`, which is kept per file so an install can move
// to S3 without losing what it stored before. See src/files/.
export const storedFiles = pgTable(
  'stored_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    driver: fileStorageDriver('driver').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    // When a virus scanner passed it. Null if this install doesn't scan.
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    uploadedById: uuid('uploaded_by_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('stored_files_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'stored_files_uploaded_by_fk',
      columns: [t.organizationId, t.uploadedById],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

export const controlTheme = pgEnum('control_theme', [
  'organizational',
  'people',
  'physical',
  'technological',
]);

// Global, read-only control catalog. Seeded from src/controls/annex-a-2022.ts.
export const controls = pgTable(
  'controls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    framework: text('framework').notNull(),
    ref: text('ref').notNull(),
    title: text('title').notNull(),
    theme: controlTheme('theme').notNull(),
  },
  (t) => [uniqueIndex('controls_framework_ref_idx').on(t.framework, t.ref)],
);

export const implementationStatus = pgEnum('implementation_status', [
  'not_started',
  'planned',
  'partial',
  'implemented',
]);

// Statement of Applicability: one row per organization and control, catalog or its own.
export const soaEntries = pgTable(
  'soa_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    controlId: uuid('control_id').references(() => controls.id),
    // An Organization's own control, in place of a catalog one. Shown as OWN-1.
    ownNumber: integer('own_number'),
    ownTitle: text('own_title'),
    ownerId: uuid('owner_id'),
    applicable: boolean('applicable').notNull().default(true),
    justification: text('justification').notNull().default(''),
    status: implementationStatus('status').notNull().default('not_started'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('soa_entries_org_control_idx').on(t.organizationId, t.controlId),
    uniqueIndex('soa_entries_org_own_idx').on(t.organizationId, t.ownNumber),
    unique('soa_entries_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'soa_entries_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
    check(
      'soa_entries_catalog_or_own',
      sql`(${t.controlId} is not null) <> (${t.ownNumber} is not null)`,
    ),
  ],
);

export const documentKind = pgEnum('document_kind', [
  'scope',
  'policy',
  'interested_parties',
  'roles',
  'objectives',
  'legal_requirements',
  'competence',
  'awareness',
  'internal_audit',
  'management_review',
]);

// A record the Organization maintains in its audit file. What it says lives in its versions.
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: documentKind('kind').notNull(),
    ownerId: uuid('owner_id').notNull(),
    // A withdrawn Document no longer applies but stays on record.
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnReason: text('withdrawn_reason'),
    // A deleted Document was created by mistake. The row stays for the Audit trail.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('documents_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'documents_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

// One version of a Document: text, an uploaded file, or both. Confirmed versions never change.
export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull().default(''),
    storedFileId: uuid('stored_file_id'),
    createdById: uuid('created_by_id').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedById: uuid('confirmed_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('document_versions_document_version_idx').on(t.documentId, t.version),
    foreignKey({
      name: 'document_versions_document_fk',
      columns: [t.organizationId, t.documentId],
      foreignColumns: [documents.organizationId, documents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'document_versions_file_fk',
      columns: [t.organizationId, t.storedFileId],
      foreignColumns: [storedFiles.organizationId, storedFiles.id],
    }),
    foreignKey({
      name: 'document_versions_created_by_fk',
      columns: [t.organizationId, t.createdById],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      name: 'document_versions_confirmed_by_fk',
      columns: [t.organizationId, t.confirmedById],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

// Proof that a control is operating: an upload, a Document, or a note of where it is kept.
export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    soaEntryId: uuid('soa_entry_id').notNull(),
    title: text('title').notNull(),
    location: text('location'),
    storedFileId: uuid('stored_file_id'),
    documentId: uuid('document_id'),
    datedOn: date('dated_on').notNull(),
    expiresOn: date('expires_on'),
    addedById: uuid('added_by_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('evidence_soa_entry_idx').on(t.soaEntryId),
    uniqueIndex('evidence_stored_file_idx').on(t.storedFileId),
    foreignKey({
      name: 'evidence_soa_entry_fk',
      columns: [t.organizationId, t.soaEntryId],
      foreignColumns: [soaEntries.organizationId, soaEntries.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'evidence_file_fk',
      columns: [t.organizationId, t.storedFileId],
      foreignColumns: [storedFiles.organizationId, storedFiles.id],
    }),
    foreignKey({
      name: 'evidence_document_fk',
      columns: [t.organizationId, t.documentId],
      foreignColumns: [documents.organizationId, documents.id],
    }),
    foreignKey({
      name: 'evidence_added_by_fk',
      columns: [t.organizationId, t.addedById],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

export const supplierCriticality = pgEnum('supplier_criticality', ['low', 'medium', 'high']);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Shown as S-01. Counts up per Organization and is never reused.
    number: integer('number').notNull(),
    name: text('name').notNull(),
    provides: text('provides').notNull().default(''),
    ownerId: uuid('owner_id').notNull(),
    criticality: supplierCriticality('criticality').notNull().default('medium'),
    handlesPersonalData: boolean('handles_personal_data').notNull().default(false),
    // Who to reach about a security problem.
    contact: text('contact').notNull().default(''),
    // Null means the contract rolls on with no end date.
    contractEnds: date('contract_ends'),
    exitPlan: text('exit_plan').notNull().default(''),
    nextReviewOn: date('next_review_on').notNull(),
    // An ended Supplier no longer serves the Organization but stays on record.
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedReason: text('ended_reason'),
    // A deleted Supplier was entered by mistake. The row stays for the Audit trail.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('suppliers_org_number_idx').on(t.organizationId, t.number),
    unique('suppliers_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'suppliers_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

export const supplierFileKind = pgEnum('supplier_file_kind', [
  'contract',
  'data_processing_agreement',
  'certificate',
  'security_assessment',
  'other',
]);

// A dated piece of paperwork: an uploaded file, or `location` saying where it is kept, or both.
export const supplierFiles = pgTable(
  'supplier_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    supplierId: uuid('supplier_id').notNull(),
    kind: supplierFileKind('kind').notNull(),
    title: text('title').notNull(),
    location: text('location'),
    storedFileId: uuid('stored_file_id'),
    datedOn: date('dated_on').notNull(),
    expiresOn: date('expires_on'),
    ...timestamps,
  },
  (t) => [
    index('supplier_files_supplier_idx').on(t.supplierId),
    uniqueIndex('supplier_files_stored_file_idx').on(t.storedFileId),
    foreignKey({
      name: 'supplier_files_stored_file_fk',
      columns: [t.organizationId, t.storedFileId],
      foreignColumns: [storedFiles.organizationId, storedFiles.id],
    }),
    foreignKey({
      name: 'supplier_files_supplier_fk',
      columns: [t.organizationId, t.supplierId],
      foreignColumns: [suppliers.organizationId, suppliers.id],
    }).onDelete('cascade'),
  ],
);

export const supplierReviewOutcome = pgEnum('supplier_review_outcome', [
  'no_concerns',
  'concerns',
  'stop_using',
]);

// Never edited: a correction is a new review.
export const supplierReviews = pgTable(
  'supplier_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    supplierId: uuid('supplier_id').notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    reviewedOn: date('reviewed_on').notNull(),
    outcome: supplierReviewOutcome('outcome').notNull(),
    notes: text('notes').notNull(),
    nextReviewOn: date('next_review_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('supplier_reviews_supplier_idx').on(t.supplierId, t.reviewedOn),
    foreignKey({
      name: 'supplier_reviews_supplier_fk',
      columns: [t.organizationId, t.supplierId],
      foreignColumns: [suppliers.organizationId, suppliers.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'supplier_reviews_reviewer_fk',
      columns: [t.organizationId, t.reviewerId],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

export const assetType = pgEnum('asset_type', [
  'information',
  'software',
  'hardware',
  'service',
  'people',
  'site',
]);

export const classification = pgEnum('classification', [
  'public',
  'internal',
  'confidential',
  'strictly_confidential',
]);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: assetType('type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    classification: classification('classification').notNull().default('internal'),
    // The Supplier that provides this asset, if any.
    supplierId: uuid('supplier_id'),
    // A retired asset is no longer in use but stays on record.
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    retiredReason: text('retired_reason'),
    // A deleted asset was entered by mistake. The row stays for the Audit trail.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('assets_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'assets_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      name: 'assets_supplier_fk',
      columns: [t.organizationId, t.supplierId],
      foreignColumns: [suppliers.organizationId, suppliers.id],
    }),
  ],
);

// One row per Organization. A missing row means the defaults in risk-criteria.service.ts.
export const riskCriteria = pgTable('risk_criteria', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  acceptanceThreshold: integer('acceptance_threshold').notNull(),
  likelihoodLevels: text('likelihood_levels').array().notNull(),
  impactLevels: text('impact_levels').array().notNull(),
  ...timestamps,
});

export const riskTreatment = pgEnum('risk_treatment', ['mitigate', 'accept', 'transfer', 'avoid']);

export const risks = pgTable(
  'risks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Shown as R-01. Counts up per Organization and is never reused.
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    ownerId: uuid('owner_id').notNull(),
    // 1–5 scales; risk score is likelihood × impact.
    likelihood: integer('likelihood').notNull(),
    impact: integer('impact').notNull(),
    // The same scales after treatment. Null until the treatment has been rated.
    residualLikelihood: integer('residual_likelihood'),
    residualImpact: integer('residual_impact'),
    treatment: riskTreatment('treatment'),
    reviewOn: date('review_on').notNull(),
    // A closed risk no longer applies but stays in the register's records.
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedReason: text('closed_reason'),
    // A deleted risk was entered by mistake. The row stays so the Audit trail can point at it.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('risks_org_number_idx').on(t.organizationId, t.number),
    unique('risks_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'risks_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
    check('risks_likelihood_range', sql`${t.likelihood} between 1 and 5`),
    check('risks_impact_range', sql`${t.impact} between 1 and 5`),
    check(
      'risks_residual_range',
      sql`(${t.residualLikelihood} is null and ${t.residualImpact} is null) or (${t.residualLikelihood} between 1 and 5 and ${t.residualImpact} between 1 and 5)`,
    ),
  ],
);

export const riskAssets = pgTable(
  'risk_assets',
  {
    organizationId: uuid('organization_id').notNull(),
    riskId: uuid('risk_id').notNull(),
    assetId: uuid('asset_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.riskId, t.assetId] }),
    foreignKey({
      name: 'risk_assets_risk_fk',
      columns: [t.organizationId, t.riskId],
      foreignColumns: [risks.organizationId, risks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'risk_assets_asset_fk',
      columns: [t.organizationId, t.assetId],
      foreignColumns: [assets.organizationId, assets.id],
    }).onDelete('cascade'),
  ],
);

export const riskControls = pgTable(
  'risk_controls',
  {
    organizationId: uuid('organization_id').notNull(),
    riskId: uuid('risk_id').notNull(),
    controlId: uuid('control_id')
      .notNull()
      .references(() => controls.id),
  },
  (t) => [
    primaryKey({ columns: [t.riskId, t.controlId] }),
    foreignKey({
      name: 'risk_controls_risk_fk',
      columns: [t.organizationId, t.riskId],
      foreignColumns: [risks.organizationId, risks.id],
    }).onDelete('cascade'),
  ],
);

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Shown as INC-001. Counts up per Organization and is never reused.
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    occurredOn: date('occurred_on').notNull(),
    ownerId: uuid('owner_id').notNull(),
    // The risk this Incident is an example of, if any.
    riskId: uuid('risk_id'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedById: uuid('closed_by_id'),
    closedReason: text('closed_reason'),
    // A deleted Incident was reported by mistake. The row stays for the Audit trail.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('incidents_org_number_idx').on(t.organizationId, t.number),
    unique('incidents_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'incidents_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      name: 'incidents_closed_by_fk',
      columns: [t.organizationId, t.closedById],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      name: 'incidents_risk_fk',
      columns: [t.organizationId, t.riskId],
      foreignColumns: [risks.organizationId, risks.id],
    }),
  ],
);

// A completed Risk assessment keeps the register as it stood on that date.
export const riskAssessments = pgTable(
  'risk_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startedOn: date('started_on').notNull(),
    completedOn: date('completed_on'),
    completedById: uuid('completed_by_id'),
    acceptanceThreshold: integer('acceptance_threshold'),
    register: jsonb('register').$type<RegisterEntry[]>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('risk_assessments_one_open_idx')
      .on(t.organizationId)
      .where(sql`${t.completedOn} is null`),
    foreignKey({
      name: 'risk_assessments_completed_by_fk',
      columns: [t.organizationId, t.completedById],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

// Follow-up work, linked to the risk, SoA entry, Supplier or Incident it belongs to.
export const nonconformities = pgTable(
  'nonconformities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Shown as NC-001. Counts up per Organization and is never reused.
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    // Where it came to light, such as an internal audit or a Supplier review.
    foundIn: text('found_in').notNull(),
    foundOn: date('found_on').notNull(),
    // Why it happened. It can't be closed until someone has said.
    cause: text('cause').notNull().default(''),
    ownerId: uuid('owner_id').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedById: uuid('closed_by_id'),
    closedReason: text('closed_reason'),
    // A deleted Nonconformity was recorded by mistake. The row stays for the Audit trail.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('nonconformities_org_number_idx').on(t.organizationId, t.number),
    unique('nonconformities_org_id_unique').on(t.organizationId, t.id),
    foreignKey({
      name: 'nonconformities_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      name: 'nonconformities_closed_by_fk',
      columns: [t.organizationId, t.closedById],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    ownerId: uuid('owner_id').notNull(),
    dueOn: date('due_on').notNull(),
    doneAt: timestamp('done_at', { withTimezone: true }),
    // A cancelled Task is no longer needed. It stays on record with the reason.
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledReason: text('cancelled_reason'),
    riskId: uuid('risk_id'),
    soaEntryId: uuid('soa_entry_id'),
    supplierId: uuid('supplier_id'),
    incidentId: uuid('incident_id'),
    nonconformityId: uuid('nonconformity_id'),
    ...timestamps,
  },
  (t) => [
    index('tasks_org_due_idx').on(t.organizationId, t.dueOn),
    foreignKey({
      name: 'tasks_owner_fk',
      columns: [t.organizationId, t.ownerId],
      foreignColumns: [members.organizationId, members.id],
    }),
    foreignKey({
      name: 'tasks_risk_fk',
      columns: [t.organizationId, t.riskId],
      foreignColumns: [risks.organizationId, risks.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tasks_soa_entry_fk',
      columns: [t.organizationId, t.soaEntryId],
      foreignColumns: [soaEntries.organizationId, soaEntries.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tasks_supplier_fk',
      columns: [t.organizationId, t.supplierId],
      foreignColumns: [suppliers.organizationId, suppliers.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tasks_incident_fk',
      columns: [t.organizationId, t.incidentId],
      foreignColumns: [incidents.organizationId, incidents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tasks_nonconformity_fk',
      columns: [t.organizationId, t.nonconformityId],
      foreignColumns: [nonconformities.organizationId, nonconformities.id],
    }).onDelete('cascade'),
  ],
);

// The Organization's permanent record of who changed what, when and why (ADR 0005). Append-only:
// a database trigger refuses updates and deletes. Names are kept as they were at the time.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Orders events that share a timestamp.
    sequence: bigint('sequence', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    memberName: text('member_name').notNull(),
    action: text('action').$type<AuditAction>().notNull(),
    recordType: text('record_type').$type<AuditRecordType>().notNull(),
    recordId: uuid('record_id'),
    recordRef: text('record_ref'),
    recordLabel: text('record_label').notNull(),
    before: jsonb('before').$type<AuditValue>(),
    after: jsonb('after').$type<AuditValue>(),
    reason: text('reason'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_org_sequence_idx').on(t.organizationId, t.sequence),
    index('audit_events_record_idx').on(t.recordId, t.sequence),
    foreignKey({
      name: 'audit_events_member_fk',
      columns: [t.organizationId, t.memberId],
      foreignColumns: [members.organizationId, members.id],
    }),
  ],
);
