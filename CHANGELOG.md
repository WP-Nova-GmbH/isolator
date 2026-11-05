# 1.2.0 (2026-11-05)
## Features
- __api,web:__ sort, search and page every register (50733d4)
## Bug Fixes
- __web:__ stop clipping the sign-in form's borders (62161fc)
- __web:__ renew the Clerk session when the user is back, not on click (84c0ead)
# 1.1.0 (2026-11-05)
## Features
- __api,web:__ import and export the asset and Supplier registers as CSV (8dad28b)
- __api,web:__ link an asset to many Suppliers (682acee)
- __web:__ make a Supplier's tabs routes (263d7f7)
- __web:__ declutter record pages (16ab60d)
- __web:__ show records read-only and change them in dialogs (1aeba85)
## Bug Fixes
- __web:__ renew the Clerk session when the user is back, not on click (651317b)
- __api,web:__ make the Suppliers page scannable (d6af6c9)
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