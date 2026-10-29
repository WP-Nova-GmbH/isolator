import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

// Statement of Applicability: one row per organization and control.
export const soaEntries = pgTable(
  'soa_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    controlId: uuid('control_id')
      .notNull()
      .references(() => controls.id),
    applicable: boolean('applicable').notNull().default(true),
    justification: text('justification'),
    status: implementationStatus('status').notNull().default('not_started'),
    ...timestamps,
  },
  (t) => [uniqueIndex('soa_entries_org_control_idx').on(t.organizationId, t.controlId)],
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

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: assetType('type').notNull(),
  owner: text('owner'),
  classification: classification('classification').notNull().default('internal'),
  ...timestamps,
});

export const riskTreatment = pgEnum('risk_treatment', ['mitigate', 'accept', 'transfer', 'avoid']);

export const riskStatus = pgEnum('risk_status', ['identified', 'assessed', 'treated', 'closed']);

export const risks = pgTable('risks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  // 1–5 scales; risk score is likelihood × impact.
  likelihood: integer('likelihood').notNull(),
  impact: integer('impact').notNull(),
  treatment: riskTreatment('treatment'),
  status: riskStatus('status').notNull().default('identified'),
  owner: text('owner'),
  reviewDueOn: date('review_due_on'),
  ...timestamps,
});

export const riskControls = pgTable(
  'risk_controls',
  {
    riskId: uuid('risk_id')
      .notNull()
      .references(() => risks.id, { onDelete: 'cascade' }),
    controlId: uuid('control_id')
      .notNull()
      .references(() => controls.id),
  },
  (t) => [primaryKey({ columns: [t.riskId, t.controlId] })],
);
