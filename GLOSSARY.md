# Glossary

**Organization** – a tenant; the customer running exactly one ISMS towards one certificate. It is not a legal entity: one Organization can cover several companies named in its Scope, and companies certified separately are separate Organizations.

**ISMS** – Information Security Management System: the policies, processes and controls an organization operates to manage information security (ISO 27001 clauses 4–10).

**Scope** – the boundaries of the ISMS (clause 4.3): which companies, locations, units, systems are covered.

**Member** – a person invited into an Organization. Every Member sees everything in its ISMS; their Role decides what they can change, and a risk's Confirmation comes from its risk owner. A removed Member can no longer reach the Organization but stays on record, and comes back the same Member if invited again. Closed records keep their name as owner, and whoever brings one back takes it over.

**Role** – what a Member may do. An **Administrator** does everything an Editor does and manages Members, their Roles and the Organization's settings; an Organization always keeps at least one. An **Editor** adds and changes records and gives Confirmations. A **Reviewer** reads everything and gives the decisions made in a person's name: Confirmations, and closing or reopening a risk they own. An **Auditor** reads everything, including the Audit trail and files, changes nothing and owns nothing.

**Invitation** – a link, good for one use and for 7 days, that lets one email address join an Organization as a Member with a given Role. An Administrator creates one. The Operator can for any Organization, and those make the person an Administrator.

**Operator** – the person who claimed an install of Isolator. The Operator creates its Organizations and invites their first Members.

**Control** – an entry in a control catalog, e.g. Annex A 2022 `A.8.13 Information backup`, or one an Organization adds itself. Catalog controls are global and read-only.

**Statement of Applicability (SoA)** – per Organization, one entry per control, including its own, stating whether it applies, why, and its implementation status.

**Asset** – something of value to the organization that needs protecting: information, software, hardware, services, people, sites. It is planned or operational, and has a business owner, who is accountable for it, and a technical owner, who runs it; either can be unassigned and its classification unknown. Its record keeps its locations, its source (where the record came from, such as an inventory export) and whether it has been validated against the asset itself.

**Supplier** – an outside company providing a product or service the Organization relies on. Service assets link to the Supplier that provides them. Its owner can be unassigned, and its criticality, whether it handles personal data and its contract term (an end date, or rolling until notice) can be unknown; the Supplier lists what is still unknown as needing attention.

**Supplier review** – a dated check of a Supplier by a Member, with an outcome and notes, that sets the next review date. A correction is a new review.

**Supplier file** – a dated contract, data processing agreement, certificate or security assessment for a Supplier, uploaded or with a note of where it is kept. It isn't a Document: it has no versions and needs no Confirmation.

**Ended Supplier** – a Supplier that no longer serves the Organization. It leaves the register with a reason but stays on record, and can be resumed.

**Risk** – a potential event that harms the confidentiality, integrity or availability of information, affecting any number of assets. Scored as likelihood × impact (1–5 each), before treatment and again after it (residual risk).

**Risk criteria** – an Organization's acceptance threshold and the meaning of each likelihood and impact level.

**Risk owner** – the Member accountable for a risk, who gives the Confirmation for its rating and treatment.

**Risk treatment** – the decision for a risk: mitigate (apply controls), accept, transfer, or avoid.

**Closed risk** – a risk that no longer applies. Its risk owner closes it with a reason; it leaves the register but stays on record, and can be reopened, which needs a new Confirmation.

**Risk assessment** – a dated review of the risk register. The first one establishes the register; recurring ones (at least yearly, or on significant change) revisit it. Each one preserves the register as it stood on that date.

**Confirmation** – a Member's dated decision on an SoA entry, a risk rating, a risk treatment or a Document version, kept together with the value it replaced. Every such decision needs one, whether a person or AI drafted it.

**Incident** – an information security event that has happened and needs handling. A risk is what could happen; an incident is what did. It is closed with how it was resolved, and stays on record.

**Nonconformity** – a failure to meet a requirement of the standard or of the Organization's own ISMS, found for example in an internal audit. The Tasks that correct it belong to it. It closes once its cause is recorded, its Tasks are finished, and a Member says how they know it is fixed.

**Task** – follow-up work with an owner and a due date, linked to the risk, Nonconformity, control, Supplier or Incident it belongs to. A Task that is no longer needed is cancelled with a reason, and stays on record.

**Proposed Task** – a Task recorded before anyone has agreed to it, such as a treatment action still under discussion. It may have no owner or due date yet. Committing to it agrees both, and only then can it be marked done; turning it down cancels it. It keeps its record open like any unfinished Task.

**Register** – a list of records of one kind, each with its own lifecycle: risks, assets, suppliers, incidents, nonconformities.

**Readiness checklist** – everything clauses 4–10 and Annex A need for the certificate, each item marked done, drafted or missing.

**Audit file** – everything an Organization shows a certification body: its SoA, registers, Documents, Evidence and Audit trail.

**Audit trail** – an Organization's permanent record of who changed what, when and why. Entries can't be edited or removed. Deleting a record takes it out of its register, never out of the Audit trail, and only a draft nobody ever confirmed can be deleted.

**Scan** – an automated check against an organization's systems (cloud accounts, identity provider, endpoints, external surface) that produces findings.

**Finding** – a single result of a scan, which may raise or update a risk or count as evidence for a control.

**Evidence** – a file or a link to a Document showing a control is operating (screenshot, scan result, log export), attached to an SoA entry, with the date it carries if that is known. It has no versions and needs no Confirmation.

**Document** – a versioned record the Organization maintains in its audit file, such as a policy, a procedure, the risk methodology, a security objective, a competence record, an assessment, an inventory or reference material. Each version needs a Confirmation, and the last confirmed version stays in force until a newer one is confirmed. Each version has a source date, the date it carries itself, which may be unknown and is kept apart from when it was added.

**Withdrawn Document** – a Document that no longer applies. It leaves the list with a reason but stays on record, and can be reinstated.
