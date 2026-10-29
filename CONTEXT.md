# Isolator context

Project terminology is maintained in [GLOSSARY.md](./GLOSSARY.md).

Isolator is a multi-tenant SaaS for small and mid-sized businesses implementing ISO/IEC 27001:2022, either for the first time or transitioning from the 2013 edition (the 2013 certificates expired on 2025-10-31, so "transition" in practice now mostly means first-time certification or re-certification against 2022).

The product follows the ISMS lifecycle:

1. **Establish** – define scope, pick applicable Annex A controls (SoA), build the asset inventory, run the first risk assessment.
2. **Operate** – track control implementation, collect evidence, run automated scans that feed findings into the risk register.
3. **Review** – recurring risk assessments (AI drafts, humans decide), internal audits, management review.
4. **Certify** – audit readiness checks and an evidence package for the certification body.

AI assists but never decides: risk ratings, treatment choices and SoA applicability are always confirmed by a named person, and that confirmation is recorded.
