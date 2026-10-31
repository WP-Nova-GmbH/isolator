# 2. One Organization is one ISMS

Date: 2026-11-01
Status: accepted

## Context

Customers can be groups of several companies, which may certify together or separately. The schema has one scope per organization, but nothing said whether an organization meant a legal entity or an ISMS.

## Decision

An Organization is one ISMS working towards one certificate, not a legal entity. Companies under the same certificate are named in the Organization's Scope. Companies certified separately are separate Organizations.

We rejected making each legal entity a tenant, because one certificate across several companies would then be split across tenants. We also rejected several ISMSs inside one tenant, because it adds a layer to every customer-owned table for a case that separate Organizations already cover.

## Consequences

- `organization_id` stays the only tenancy key.
- Assets, risks and SoA entries are not shared between Organizations, so separately certified companies keep their own.
- A person working for several Organizations is invited into each one.
