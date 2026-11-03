# Roadmap

Isolator has to carry an ISMS from nothing to a certificate and beyond. The phases set the build order, not the scope. WP Nova's own ISMS is the first full run.

## Phase 1 – Foundations

- [x] Annex A 2022 control catalog
- [x] Production image: one container for the API and web app, with Postgres outside it
- [ ] Docker Compose stack for self-hosting
- [x] File storage: on local disk, or in S3 when configured
- [x] Claiming an install, sign-in and invitations (Clerk)
- [x] Organizations and Members: creating, inviting, switching and removing
- [x] Tenancy fixes: `organization_id` on `risk_controls`, no references across Organizations
- [ ] German, English and French interface, with our own control titles
- [x] Confirmations for risks, SoA entries and Document versions
- [x] Audit trail: append-only record of every change, with CSV export
- [x] Documents

## Phase 2 – Establish

- [x] Scope as a Document
- [x] Statement of Applicability: applicability, justification, status and owner per control, including own controls
- [x] Risk criteria
- [x] Asset register
- [x] Supplier register: reviews, contracts and certificates, linked assets, risks and Tasks
- [x] Risk register with likelihood × impact matrix, scores before and after treatment, risk owners, linked assets and controls
- [x] Risk assessments
- [x] Tasks on risks, SoA entries, Suppliers, Incidents and Nonconformities
- [x] Readiness checklist on the Overview page
- [ ] Policy templates (own wording, not ISO text)

## Phase 3 – Operate

- [x] Evidence attached to SoA entries
- [x] Incident register
- [ ] In-app reminders, with optional email

## Phase 4 – Review and Certify

- [x] Nonconformity register
- [x] Internal audit and management review as Documents
- [ ] Audit file export (the page shows what goes in; the ZIP is still to come)

## Later

- [ ] Scan framework: background workers, findings → risks/evidence
- [ ] First integrations: Microsoft 365 / Entra ID, Google Workspace, AWS, external attack surface
- [ ] AI-drafted proposals for recurring risk assessments
- [ ] Import of an existing SoA and risk register

## Open questions

- Legal check on ISO control titles under the MIT licence, before the repo goes public.
- How long the Audit trail is kept, and how personal data is erased from it.
- Background jobs: pg-boss (Postgres only) vs. BullMQ (Redis).
- AI provider, data residency, and how customer data is kept out of training.
