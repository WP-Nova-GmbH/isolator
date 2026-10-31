# Glossary

**Organization** – a tenant; the customer running exactly one ISMS towards one certificate. It is not a legal entity: one Organization can cover several companies named in its Scope, and companies certified separately are separate Organizations.

**ISMS** – Information Security Management System: the policies, processes and controls an organization operates to manage information security (ISO 27001 clauses 4–10).

**Scope** – the boundaries of the ISMS (clause 4.3): which companies, locations, units, systems are covered.

**Member** – a person invited into an Organization. Every Member can see and do everything in its ISMS, except that a risk's Confirmation comes from its risk owner.

**Operator** – the person who claimed an install of Isolator. The Operator creates its Organizations and invites their first Members.

**Control** – an entry in a control catalog, e.g. Annex A 2022 `A.8.13 Information backup`, or one an Organization adds itself. Catalog controls are global and read-only.

**Statement of Applicability (SoA)** – per Organization, one entry per control, including its own, stating whether it applies, why, and its implementation status.

**Asset** – something of value to the organization that needs protecting: information, software, hardware, services, people, sites.

**Supplier** – an outside company providing a product or service the Organization relies on. Service assets link to the Supplier that provides them.

**Risk** – a potential event that harms the confidentiality, integrity or availability of information, affecting any number of assets. Scored as likelihood × impact (1–5 each), before treatment and again after it (residual risk).

**Risk criteria** – an Organization's acceptance threshold and the meaning of each likelihood and impact level.

**Risk owner** – the Member accountable for a risk, who gives the Confirmation for its rating and treatment.

**Risk treatment** – the decision for a risk: mitigate (apply controls), accept, transfer, or avoid.

**Risk assessment** – a dated review of the risk register. The first one establishes the register; recurring ones (at least yearly, or on significant change) revisit it. Each one preserves the register as it stood on that date.

**Confirmation** – a Member's dated decision on an SoA entry, a risk rating, a risk treatment or a Document version, kept together with the value it replaced. Every such decision needs one, whether a person or AI drafted it.

**Incident** – an information security event that has happened and needs handling. A risk is what could happen; an incident is what did.

**Nonconformity** – a failure to meet a requirement of the standard or of the Organization's own ISMS, found for example in an internal audit.

**Task** – follow-up work with an owner and a due date, linked to the risk, Nonconformity or control it belongs to.

**Register** – a list of records of one kind, each with its own lifecycle: risks, assets, suppliers, incidents, nonconformities.

**Readiness checklist** – everything clauses 4–10 and Annex A need for the certificate, each item marked done, drafted or missing.

**Audit file** – everything an Organization shows a certification body: its SoA, registers, Documents and Evidence.

**Scan** – an automated check against an organization's systems (cloud accounts, identity provider, endpoints, external surface) that produces findings.

**Finding** – a single result of a scan, which may raise or update a risk or count as evidence for a control.

**Evidence** – a dated file or a link to a Document showing a control is operating (screenshot, scan result, log export), attached to an SoA entry. It has no versions and needs no Confirmation.

**Document** – a versioned record the Organization maintains in its audit file, such as a policy, a security objective or a competence record. Each version needs a Confirmation.
