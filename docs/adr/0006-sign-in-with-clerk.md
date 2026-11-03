# 6. Sign-in runs on Clerk

Date: 2026-11-02
Status: accepted

## Context

[ADR 0004](0004-self-hostable-with-own-auth.md) chose better-auth over Clerk so that a self-hosted install needs no outside service. That made keeping auth secure our job, on a stack that sends no email, so nothing verified an address and a forgotten password was reset on the server.

## Decision

Every install signs in through Clerk, with its own Clerk application. Clerk holds credentials and sessions and sends sign-in email. better-auth is gone, along with its password, account and verification data.

Everything the ISMS hangs on stays in our Postgres: people in `users`, Organizations, Members and invitation links. Clerk Organizations stay off. `users.id` doesn't change, so Members and the Audit trail are untouched.

## Consequences

- This replaces what ADR 0004 says about sign-in, and the stack no longer runs without an outside service. Each install needs a Clerk application, and nobody can sign in while Clerk is down. Everything else in ADR 0004 stands, including that later additions stay optional or run inside the stack.
- Names and email addresses leave the stack, so Clerk is a sub-processor for customers of a hosted install.
- The web app loads Clerk's sign-in from Clerk, so its Content-Security-Policy has to allow that. The publishable key comes from the API at runtime, because one image serves every install.
- Anyone can create a Clerk account for an install, but that opens nothing: a Membership still comes from an invitation, for the address it names, and claiming still takes the setup token from the logs.
- Passwords don't move to Clerk. The first sign-in with a verified address links to the existing person with that address, and a `users` row already linked to another Clerk account is never taken over.
- The API checks Clerk's session token on each request and asks Clerk who someone is once per session, so a change made in Clerk reaches Isolator at that person's next sign-in. `sessions` keeps a row per Clerk session, which keeps the working Organization per browser.
- Going back would be a migration of its own, because the passwords are deleted.
