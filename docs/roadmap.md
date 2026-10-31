# Roadmap

Isolator has to carry an ISMS from nothing to a certificate and beyond. The phases set the build order, not the scope. WP Nova's own ISMS is the first full run.

## Phase 1 – Foundations

- [x] Annex A 2022 control catalog
- [ ] Docker Compose stack for self-hosting
- [ ] Claiming an install, sign-in and invitations (better-auth)
- [ ] Organizations and Members
- [ ] Tenancy fixes: `organization_id` on `risk_controls`, no references across Organizations
- [ ] German, English and French interface, with our own control titles
- [ ] Confirmations
- [ ] Documents

## Phase 2 – Establish

- [ ] Scope as a Document
- [ ] Statement of Applicability: applicability, justification, status and owner per control, including own controls
- [ ] Risk criteria
- [ ] Asset register
- [ ] Supplier register
- [ ] Risk register with likelihood × impact matrix, scores before and after treatment, risk owners, linked assets and controls
- [ ] Risk assessments
- [ ] Tasks
- [ ] Readiness checklist on the Overview page
- [ ] Policy templates (own wording, not ISO text)

## Phase 3 – Operate

- [ ] Evidence attached to SoA entries
- [ ] Incident register
- [ ] In-app reminders, with optional email

## Phase 4 – Review and Certify

- [ ] Nonconformity register
- [ ] Internal audit and management review as Documents
- [ ] Audit file export

## Later

- [ ] Scan framework: background workers, findings → risks/evidence
- [ ] First integrations: Microsoft 365 / Entra ID, Google Workspace, AWS, external attack surface
- [ ] AI-drafted proposals for recurring risk assessments
- [ ] Import of an existing SoA and risk register

## Open questions

- Legal check on ISO control titles under the MIT licence, before the repo goes public.
- Background jobs: pg-boss (Postgres only) vs. BullMQ (Redis).
- AI provider, data residency, and how customer data is kept out of training.
