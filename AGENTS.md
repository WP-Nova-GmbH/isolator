# Agent instructions

## Commits

Conventional-commit **scope is the app the change is for**: `api` or `web`. Never a feature or domain name (`risks`, `soa`). Several apps as first-class work: `feat(api,web):`. Repo-root tooling, docs, or lockfile with no app: omit the scope (`chore:`, `docs:`).

## Domain

Use the terms in [GLOSSARY.md](GLOSSARY.md). Record decisions that are hard to reverse as ADRs in `docs/adr/`.

## ISO content

Never reproduce ISO/IEC 27001 or 27002 control text: it is copyrighted. Control references and titles are fine; descriptions and guidance must be our own wording.

## Data

Every customer-owned table carries `organization_id` and every query on it must be scoped by it. The control catalog (`controls`) is the only global table.
