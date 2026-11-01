# 5. Changes are kept in an append-only Audit trail

Date: 2026-11-01
Status: accepted

## Context

A certification body can ask who changed a record, when, why, and what happened to a risk that is no longer in the register. Risks kept their own history table, and nothing else kept any. Deleting rows would remove the very record an auditor asks for, and an application-level promise not to touch history can't be shown to hold.

## Decision

One `audit_events` table holds every change in an Organization: the Member, the time, the record, the values before and after, and the reason where one is asked for. It is written in the transaction that makes the change. Names are stored as they were at the time. Confirmations are entries in this table, so `risk_history` is gone.

The trail is append-only at the database level: a trigger refuses updates, deletes and truncation. The one exception is deleting a whole Organization, which removes its trail through the foreign key.

Records are not removed from the database. A risk that no longer applies is closed by its owner, with a reason, and can be reopened. A risk can only be deleted if nobody ever confirmed it, also with a reason; it leaves the register, keeps its row, and its number is never reused. We rejected deleting confirmed risks, because that decision is on record and may be part of a completed Risk assessment.

We rejected a hash chain over the entries: it adds tamper evidence against the database owner, which a self-hosted customer is anyway, and it isn't needed for an audit today.

## Consequences

- Every new write path has to call `recordEvent`, or its change goes unrecorded.
- The trail only grows. Retention and erasing personal data from it are open questions.
- Someone with direct database rights can still disable the trigger.
- The trail's text comes from `describeEvent` in the web app, so old entries read in the current wording and language.
