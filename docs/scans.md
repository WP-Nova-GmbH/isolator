# Scans

Scans are on the roadmap's "Later" list. This page collects the principles we want to build them on, before any code exists. Nothing here is decided yet: whatever turns out hard to reverse becomes an ADR when we build it.

To learn how a mature scanner is put together, we studied [Prowler](https://github.com/prowler-cloud/prowler) 5.47.0, an Apache-2.0 scanner for cloud and SaaS configuration. We build our own and copy no code or data from it. That includes its compliance mapping files, whose control descriptions read close to the ISO text.

## What a scan is for

A Scan produces Findings: facts about a system at one point in time. A Finding never changes an SoA entry, a risk or a Document by itself. It can become Evidence on an SoA entry, or propose a risk or a Task, and a Member decides ([ADR 0003](adr/0003-decisions-are-recorded-as-confirmations.md)).

This is where we differ most from Prowler, which turns passing checks into a percentage per framework. An auditor judges whether a control is operating, and a configuration check is one input to that, never the verdict.

Scans also cover only part of Annex A. Prowler's own mapping links automated checks to 37 controls for AWS, 31 for Azure and 30 for GCP. It links none to clauses 4–10. It links people and physical controls only for Microsoft 365, three of each, because most of them can't be read from an API. The SoA stays the main record, and scans add to it. Most controls will always be confirmed by hand.

Prowler covers cloud accounts and SaaS tenants. Our definition of a Scan also includes endpoints and the external attack surface, which Prowler doesn't cover, so those need another reference.

## Principles from Prowler

### 1. A check stands apart from any framework

In Prowler a check is a small unit with a stable ID, a provider, a service, a severity, the type of resource it looks at, and remediation steps. Frameworks are separate files that list which checks count towards each requirement, so one check serves CIS, ISO and NIS2 alike. A requirement with no checks is marked manual.

For us: each check is defined once, with a stable ID that never changes meaning. The link from check to control is our own global table, next to `controls`, and we write it ourselves, check by check. A control with no checks is the normal case, not a gap.

### 2. One failing check is enough to flag a control

Prowler's rule for a requirement: any failing check makes it fail, all passing makes it pass, anything else is manual.

For us: the same rule decides what an SoA entry *shows* (for example "2 of 14 checks failing"). It never sets the entry's implementation status, which only a Confirmation does.

### 3. A Finding keeps its identity from scan to scan

Prowler builds a finding's ID from the provider, the check, the account, the region and the resource. Each scan compares a finding with its previous status and marks it new, changed or unchanged, and keeps the date it was first seen.

For us: a Finding about the same resource and check stays the same record across scans, with its history. That lets us show when a problem appeared and when it was fixed, and stops a weekly scan proposing the same risk 52 times a year.

### 4. Muting needs a reason and a person, and hides nothing

Prowler mutes findings through rules with a name, a reason and the person who created them. Muted findings are still stored and counted separately, never deleted.

For us: muting is a decision we already record elsewhere. Either the risk was accepted, or the control doesn't apply in the SoA. So a muted Finding points to that risk or SoA entry, carries a reason and a Member, appears in the Audit trail, and stays visible in a muted view.

### 5. Read-only access, and say exactly what each check needs

Prowler asks for read-only access everywhere and documents it per provider:

- **AWS**: a role it assumes with an External ID. The role uses AWS's managed read-only audit policies plus a small extra read-only policy, and comes as a CloudFormation or Terraform template.
- **Microsoft 365 / Entra ID**: an app registration with a list of read-only Graph application permissions. A certificate is preferred over a client secret. Exchange and Teams checks need extra PowerShell access, and Exchange also the Global Reader role. Some checks need Entra ID P2.
- **Google Workspace**: a service account with domain-wide delegation, acting as a super administrator, limited to six read-only scopes. One optional scope isn't read-only, and the docs advise against granting it.

For us: ask only for read-only access, and record which permission each check needs. A customer can then grant less and see exactly which checks won't run. Give a ready-made template wherever the provider allows one, and prefer certificates to secrets. Explain plainly where access is broader than it sounds, such as Google's delegation to a super administrator.

### 6. A check that can't run is not a pass

Prowler tests the credentials in a separate job before the first scan and shows the result. Without the access a check needs, it leaves the check out, for example the PowerShell checks for Microsoft 365.

For us: test the connection on setup and show which permissions are missing. "Couldn't run" is its own result, shown as such, and never counts as passing.

### 7. Credentials are encrypted at rest

Prowler stores provider credentials encrypted in the database and decrypts them only when it uses them.

For us: encrypt them with a key from the environment, never in the database. Never return them through the API, and never write them to the Audit trail. Changing the key needs a documented way to re-encrypt.

### 8. Scans run in the background, one at a time per account

Prowler runs scans in background workers. A scheduler starts one per connected account every 24 hours, and people can start one by hand. A scan records how it was started and its state: scheduled, running, completed, failed or cancelled. Only one scan per account runs at a time, and a second one waits in a queue. When a scan finishes, follow-up jobs build its summaries. A watchdog notices jobs whose worker died, and re-runs only those that are safe to run twice.

For us: this is the list of needs behind the roadmap's open question, pg-boss or BullMQ. We need schedules, one job at a time per account, retries, and recovery of jobs whose worker died, so weigh both against that list. pg-boss would keep it all inside Postgres, so the stack keeps one database. Every job must be safe to run twice: scanning again writes the same Findings, not duplicates.

### 9. The database enforces tenant isolation

Every tenant-owned table in Prowler has Postgres row-level security on `tenant_id`. Each request or job sets the tenant for its transaction, and the database returns only that tenant's rows.

For us: today every query is scoped by `organization_id` in code ([AGENTS.md](../AGENTS.md)). Workers run outside a request, where a missing scope is easier to overlook. Row-level security would make the database refuse such a query as a second line of defence. It would apply to the whole app, not only to scans, so adopting it needs its own ADR.

## How a Finding reaches the ISMS

Prowler has nothing like this. It is ours to design, and it is the part that matters most.

1. A scan runs each check on each resource it finds and records a Finding: passed, failed, or couldn't run.
2. Each SoA entry whose control has linked checks shows their latest results and when they last ran.
3. A Member can keep a scan result as Evidence on the SoA entry. It is a dated snapshot stored as a file, so the next scan doesn't change it. This fits the existing `evidence` table: a stored file, and `dated_on` set to the scan date.
4. A failed Finding can propose a risk, or a Proposed Task linked to the control. Committing to it, or turning it down, works as it does today.
5. When the Finding passes again, the open Task or risk shows it, and a Member decides whether that closes it. Nothing closes automatically.

## What we leave out

- Compliance percentages and overall scores: the SoA and its Confirmations carry the state.
- Frameworks other than ISO/IEC 27001:2022 Annex A.
- Attack paths and the graph database they need.
- Chat over findings: AI comes later, and only drafts.
- Partitioned tables: a mid-sized business has a few accounts, not thousands. Per-scan summaries are enough to keep the Overview and SoA pages fast.

## Open questions

- Who reviews a new link from a check to a control, and whether an Organization can link checks to its own controls.
- Whether scans run in the API container or in a separate worker container from the same image.
- How long Findings are kept, together with the Audit trail retention question on the roadmap.
- What runs the endpoint and external attack surface checks.

## Where to look in Prowler 5.47.0

| Topic | Path |
| --- | --- |
| Check definition and result | `prowler/lib/check/models.py`, any `*.metadata.json` under `prowler/providers/` |
| Linking checks to frameworks | `prowler/compliance/<provider>/` (read for structure only) |
| Findings, muting, stored credentials | `api/src/backend/api/models.py` (`Finding`, `MuteRule`, `ProviderSecret`) |
| New or changed, first seen | `api/src/backend/tasks/jobs/scan.py` |
| Scheduling and follow-up jobs | `api/src/backend/tasks/beat.py`, `api/src/backend/tasks/tasks.py` |
| Recovering dead jobs | `api/src/backend/tasks/jobs/orphan_recovery.py` |
| Row-level security | `api/src/backend/api/rls.py`, `api/src/backend/api/db_utils.py` |
| Provider access | [docs.prowler.com](https://docs.prowler.com), each provider's authentication page |
