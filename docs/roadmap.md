# Roadmap

## Phase 1 – Establish (MVP)

- [x] Annex A 2022 control catalog
- [ ] Auth and organization onboarding (ADR pending)
- [ ] ISMS scope editor
- [ ] Statement of Applicability: applicability, justification, status per control
- [ ] Asset inventory
- [ ] Risk register with likelihood × impact matrix, treatment, owners, linked controls
- [ ] Gap analysis dashboard
- [ ] Policy templates (own wording, not ISO text)

## Phase 2 – Operate

- [ ] Evidence uploads attached to controls
- [ ] Tasks and reminders for control owners
- [ ] Scan framework: background workers, findings → risks/evidence
- [ ] First integrations: Microsoft 365 / Entra ID, Google Workspace, AWS, external attack surface

## Phase 3 – Review

- [ ] Recurring risk assessments with AI-drafted proposals (human sign-off recorded)
- [ ] Internal audit planning and findings
- [ ] Management review pack

## Phase 4 – Certify

- [ ] Audit readiness check per clause 4–10 and Annex A
- [ ] Evidence package export for the certification body
- [ ] Nonconformity and corrective action tracking

## Open questions

- Auth: Clerk (as in navio) vs. self-hosted (better-auth / Keycloak)? Customers in this space often ask for EU hosting and SSO.
- Background jobs: pg-boss (Postgres only) vs. BullMQ (Redis).
- AI provider, data residency, and how customer data is kept out of training.
- Additional frameworks: NIS2, TISAX, BSI IT-Grundschutz.
