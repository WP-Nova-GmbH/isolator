# 7. Members have Roles

Date: 2026-11-04
Status: accepted

## Context

Every Member could see and change everything, apart from a risk's Confirmation coming from its risk owner. Organizations need to let people in who should not change the ISMS: an auditor looking over the audit file, or a managing director who approves Documents and owns risks but doesn't keep the registers.

## Decision

Each Member has one Role in their Organization, stored on `members.role`: Administrator, Editor, Reviewer or Auditor. An Invitation carries the Role the person joins with. Clerk Organizations and Clerk roles stay off, as in [ADR 0006](0006-sign-in-with-clerk.md).

- Every Role reads everything, including the Audit trail and files.
- Administrators and Editors make changes. Only Administrators manage Members, Invitations, Roles and the Organization's settings, and an Organization always keeps at least one Administrator.
- Reviewers give the decisions made in a person's name: Confirmations of SoA entries, risks and Document versions, and a risk owner closing or reopening their risk. They change no records.
- Auditors change nothing and own nothing, so they can't be chosen as an owner, and a Member who still owns records can't become one.

The API enforces this in `MemberGuard`: reading is open to every Role, any other request needs an Administrator or Editor unless the route says otherwise with `@ReviewersAllowed()` or `@AdministratorsOnly()`. The web app only hides what the API would refuse.

We rejected per-record or per-register permissions, because nothing so far needs them and they would add a layer to every page. We rejected a separate Owner role above Administrator, because the Operator already covers the install.

## Consequences

- Existing Members and open Invitations became Administrators, so nobody lost access. Administrators narrow Roles from there.
- A new write route is closed to Reviewers and Auditors by default. A route that records a person's decision has to opt Reviewers in.
- The Operator's invitations make Administrators, since they bring in whoever runs the ISMS.
