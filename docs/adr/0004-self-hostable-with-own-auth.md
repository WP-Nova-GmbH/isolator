# 4. Self-hostable, with auth in our own Postgres

Date: 2026-11-01
Status: accepted

## Context

Customers must be able to run Isolator entirely on their own servers. Clerk, used in navio, was the first choice for sign-in, but it is a hosted service, so every self-hosted install would still depend on it.

## Decision

Isolator ships as one Docker Compose stack with no required outside service, and WP Nova runs the same stack on Hetzner. The person who first claims an install becomes its Operator. Sign-in uses better-auth, with users, Organizations and memberships in our Postgres. The code is MIT licensed.

## Consequences

- Keeping auth secure is our job, including getting fixes onto self-hosted installs.
- Anything added later, such as file storage, email or AI, must be optional or run inside the stack. Files go to the local disk unless `S3_BUCKET` is set, so S3 stays optional.
- Tenancy by `organization_id` stays, so an install can hold one Organization or several.
- Claiming needs no email or outside service: the API prints a setup token to its logs, so whoever can read the server's logs can claim the install. The database allows one Operator.
- The stack sends no email, so sign-up stays closed. Accounts come from claiming or from an invitation link someone passes on, and a forgotten password is reset on the server. The link is good for one use and we keep only its hash.
