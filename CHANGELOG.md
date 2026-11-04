# 1.0.0 (2026-11-04)
## Features
- __api,web:__ give Members roles (4e70a8d)
- __api,web:__ add Document kinds and source dates (ac77d76)
- __api,web:__ propose Tasks before committing to them (eeef163)
- __api,web:__ record what isn't known yet, and richer asset records (ae53edc)
- __api,web:__ sign in with Clerk instead of better-auth (94520a6)
- __api,web:__ add the Nonconformity register (9152ea1)
## Bug Fixes
- __api,web:__ open every page from a direct link (04fab6e)
- __api:__ scope remaining queries by Organization (a608c22)
- __api,web:__ tighten record ownership and lifecycle rules (b7962d1)
## BREAKING CHANGES
- existing installs need APP_URL, CLERK_PUBLISHABLE_KEY,
CLERK_SECRET_KEY and a Content-Security-Policy that allows Clerk. The
migrations delete passwords and sessions, so back up first. See "Moving
to Clerk" in docs/deployment.md.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>