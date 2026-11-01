# 3. Decisions are recorded as Confirmations

Date: 2026-11-01
Status: accepted

## Context

An auditor can ask who decided an SoA entry, a risk rating or a risk treatment, when, and what it replaced. `soa_entries` and `risks` are updated in place and `owner` is free text, so neither the person nor the earlier value survives. CONTEXT.md promises a recorded confirmation for AI-assisted decisions, but the same questions apply to decisions entered by hand.

## Decision

Every decision on an SoA entry, a risk rating, a risk treatment or a Document version is kept as a Confirmation: the Member, the date, the new value and the value it replaced. This applies whether a person or AI drafted it. A risk's Confirmation comes from its risk owner. Each Risk assessment preserves the register as it stood on its date.

We rejected recording only AI-drafted decisions, because it leaves hand-entered decisions unattributable and gives the audit file two standards.

## Consequences

- People in an Organization and the Confirmation record have to exist before SoA and risk features are built on these tables.
- Saving a decision adds to its history instead of overwriting it.
- A drafted value nobody has confirmed stays visibly unconfirmed.
- Confirmations are entries in the Audit trail, see [ADR 0005](0005-append-only-audit-trail.md).
