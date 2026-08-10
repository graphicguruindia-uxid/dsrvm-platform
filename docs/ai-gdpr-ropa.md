# GDPR Art 30 Records of Processing Activities (data map)

Version: Draft v1.2 | Date: 2026-08-10 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-30 (deliverable), DSRA-25 (G11/G18), DSRA-26 (DPIA), DSRA-20, CTO roadmap M3.2 (GDPR data map, PII controls)
Status: Draft - companion to DPIA; PII-control confirmation pending CTO on resume
Compliance: UK GDPR / EU GDPR Art 30 (records of processing); India DPDP alignment noted

## How to use

This is DSRVM's controller ROPA for its AI product lines. Controllers must keep these
records in writing (Art 30(1)). Complete the placeholder cells as systems go live; keep it
current on any processing change. Use with the DPIA (DSRA-26), AUP (DSRA-25), and vendor
register (DSRA-25).

## Processing activities register

### P1 - HR automation screening (packages/hr, apps/hr-automation)

| Field | Record |
|---|---|
| Purpose | Candidate intake + AI-assisted shortlisting for client hiring; recommendation-only, human review decides. |
| Categories of data | Name, email, resume/CV text, application metadata, screening scores/recommendation/summary, review decisions, audit events. Potential incidental special-category data in resumes (not collected directly; to be flagged/redacted - see AUP 2.2.2). |
| Data subjects | Job applicants of DSRVM clients. |
| Legal basis | Controller: legitimate interests of client hiring (Art 6(1)(f)); contract performance where candidate applies to fill a contractual role (6(1)(b)); consent where client requires it. Special category: only with explicit consent + approved protocol (Art 9(2)(a)); not processed at this stage. |
| Recipients / sub-processors | Model providers (OpenAI/Anthropic API or local Ollama) - vendor register + DPA/SCC; cloud hosting (confirm with CTO); DSRVM staff/agents with RBAC. |
| Transfers outside UK/EU | Model API calls may transit US; DPA/SCCs + ZDR where available (G3). Confirm hosting region (CTO). |
| Retention | G6 schedule (v1.1, 2026-08-08 - implement pre-production): candidate PII **6 months after final decision**; audit events **2 years** (then archive); outbox events **90 days**. See Section "Retention & deletion schedule (G6)". |
| Security | Postgres RBAC-ready, immutable audit events, encryption at rest/transit (confirm CTO), secret hygiene (AUP 2.2.1), no special-category data to models. |
| Automated decision-making | Art 22: NO solely automated decisions - human review required (DPIA). Profiling: yes (score/recommendation) - transparency notice (DSRA-27) + bias protocol (DSRA-29). |
| Risk/Docs | DPIA ai-dpia-hr-screening (DSRA-26); bias protocol ai-bias-testing-protocol (DSRA-29). |

### P2 - AI recruiting platform (DSRA-22, planned)

| Field | Record |
|---|---|
| Purpose | Sourcing + outreach + AI scoring for recruiting agencies (future). |
| Categories | As P1 plus outreach contact data, CRM notes, disposition data (DSRA-23/24 schemas). |
| Data subjects | Candidates + prospective clients (BDR/outreach contacts). |
| Legal basis | For candidates: as P1. For BDR/outreach contacts: legitimate interests (Art 6(1)(f)) with AI disclosure (Art 50) + opt-out; PECR for electronic marketing. |
| Recipients | As P1 + CRM (enrichment tools pending budget decision - Lead BDR ask). |
| Transfers | As P1. |
| Retention | Apply G6 schedule when defined. |
| Security | As P1 + outreach opt-out suppression (call-log optOut field). |
| Automated decisions | Recommendation-only (as P1); cold-calling agent must disclose AI (AUP 4). |
| Risk/Docs | DPIA update required before launch; disclosure per ai-candidate-notice + call kit. |

### P3 - Cold calling / outbound enablement (DSRA-19/23/24)

| Field | Record |
|---|---|
| Purpose | Outbound qualification + booking discovery calls for DSRVM product lines; CRM disposition logging. |
| Categories | B2B contact name, company, phone/email, call outcomes, notes, opt-out flags. |
| Data subjects | Prospect contacts at target companies (business context; individual data where identifiable). |
| Legal basis | Legitimate interests (6(1)(f)); PECR consent rules for electronic marketing (cold email needs soft-opt-in checks); AI disclosure mandatory (Art 50) - in kit (PASS DSRA-23). |
| Recipients | DSRVM agents + CRM + enrichment (pending budget). |
| Transfers | As P1. |
| Retention | Lead lists kept while prospect active; suppressed on opt-out; apply G6 schedule. |
| Security | Access controls on CRM; opt-out list integrity; no special-category data. |
| Automated decisions | AI caller - disclosure + human-controlled booking; human sales rep owns the call outcome. |
| Risk/Docs | AUP 4; ai-vendor-due-diligence; Cold Calling kit compliance notes. |

### P4 - Telemetry & usage metrics (@dsrvm/telemetry, DSRA-8)

| Field | Record |
|---|---|
| Purpose | Per-task AI cost capture + pipeline counters for pricing/offer feedback. |
| Categories | Aggregated counters, cost, task types, model/prompt versions. **No PII** by design. |
| Data subjects | N/A (no personal data). |
| Legal basis | Legitimate interests; contract analytics. Not personal-data processing - record kept for completeness. |
| Recipients | DSRVM only. |
| Retention | Per telemetry policy (short TTL; confirm CTO). |
| Security | Read-only access; no candidate identifiers. |
| Automated decisions | None. |
| Risk/Docs | ai-vendor-due-diligence (model provider data). |

### P5 - Web / enterprise surfaces (packages/web, apps/web, DSRA-7/12/13/14)

| Field | Record |
|---|---|
| Purpose | Multi-tenant web platform: auth/SSO, CMS, billing/usage, white-label hosting. |
| Categories | Account emails, tenant data, session/auth metadata, usage records, billing data. |
| Data subjects | Client staff/users/end-users of white-label sites. |
| Legal basis | Contract (6(1)(b)); legitimate interests (6(1)(f)) for security/logs; SSO requires consent/contract alignment. |
| Recipients | Hosting (Cloudflare - pending creds), DB (confirm CTO), no LLM processing of tenant content by default (AUP 2). |
| Retention | Billing records per statutory retention; sessions short TTL; apply G6. |
| Security | SSO adapter (DSRA-13), RBAC, tenant isolation, billing webhooks (DSRA-14). |
| Automated decisions | None (no AI decisions in web baseline). |
| Risk/Docs | CTO M3.2 pass; contract pack clauses D. |

### P6 - Freelancer time-tracking & invoicing (DSRA-43..52, new product line)

| Field | Record |
|---|---|
| Purpose | Time-tracking + invoicing for freelance billing: create clients/projects, log time, generate invoices from time entries, send invoices with pay-now links, collect payments (Stripe + manual mark-paid), revenue dashboard, CSV export, invoice branding, due dates + late fees, automated payment reminders. |
| Categories | Client contact name/email/company, time-entry records, invoice + payment data (amounts, status, Stripe payment info, no raw card numbers stored), user account data (email, hourly rates, branding). |
| Data subjects | DSRVM's freelance clients and their paying customers (invoice recipients). |
| Legal basis | Contract (6(1)(b)) for invoicing/payment; legitimate interests (6(1)(f)) for billing records and reminders; PECR rules for automated payment reminders (soft-opt-in checks, opt-out honoured). |
| Recipients | Stripe (payment processor - DPA/SCCs required before go-live); hosting/DB as P5; no LLM processing of billing content by default (AUP 2). |
| Transfers | As P5; Stripe payment data under Stripe standard terms + DPA. |
| Retention | Financial/billing records per statutory retention (UK accounting/tax, typically 6 years - confirm with finance/CTO before build); time entries while contract active + statutory window; dispute hold as G6. Distinct from the G6 candidate schedule. |
| Security | As P5; card data handled by Stripe only (PCI-DSS scope kept minimal - never store raw card numbers); invoice access controls; audit of pay-now/payment callbacks. |
| Automated decisions | None. Payment reminders, if automated, must disclose sender identity and respect opt-out (AUP 4 / PECR). |
| Risk/Docs | Vendor register for Stripe; no DPIA (no high-risk profiling); AUP 4 for any AI-assisted reminders. |

## Retention & deletion schedule (G6)

Version 1.0 (2026-08-08). This is the authoritative retention policy per data class for the
HR screening pipeline (P1). The deletion job must implement these rules pre-production
(gap G6). All durations measured from the trigger event below.

| Data class | Table / source | Retain for | Trigger | Disposition |
|---|---|---|---|---|
| Candidate PII (name, email, resumeText, screening result, review decision) | `candidates` | 6 months | Final decision (approve/reject) | Hard delete; purge from backups per backup window |
| Audit events (immutable action log) | `audit_events` | 2 years | Event creation | Anonymize (drop candidate identifiers) then archive |
| Outbox events (dispatch + lease metadata) | `outbox_events` | 90 days | Event creation | Delete |
| Telemetry & usage metrics (P4) | `@dsrvm/telemetry` | 90 days | Aggregation | Delete (no PII by design) |

Rules:

- **Dispute hold:** if a candidate raises a dispute, complaint, or tribunal claim, retain the
  affected candidate PII + related audit events until the matter is resolved plus 6 months,
  overriding the standard schedule. Flag such records in the deletion job.
- **Automated:** deletion is automatic via scheduled job; no manual deletion by default.
- **Special category data:** if special-category data is identified in a resume and not
  redacted, it follows the same 6-month candidate schedule; it is never sent to a model
  (AUP 2.2.2/2.3).
- **Backups:** restoration windows must not resurrect candidates whose retention has
  expired; apply the schedule at restore time (defense in depth).

## Cross-cutting notes

- **Transfers:** any US-transiting API calls need DPA/SCCs + no-training/ZDR (G3). Confirm
  hosting/data residency with CTO (DPIA pending item).
- **Retention (G6):** schedule defined (v1.1, 2026-08-08); implement deletion job
  pre-production. ROPA references the schedule; DPIA Section 6.5 references it too.
- **P6 (freelance time/invoicing, 2026-08-10):** new product line recorded (DSRA-43..52).
  Financial/billing retention follows statutory rules (typically 6 years UK accounting),
  distinct from the G6 candidate schedule; Stripe DPA + PECR reminder rules flagged pre-build.
- **Art 30 maintenance:** review this register quarterly and on any processing change;
  keep with the AI Governance baseline (DSRA-25).
- **DPO:** re-assess appointment obligation (GDPR Art 37 / DPDP SDF) as scale grows - gap
  G11 in the register; document rationale with CEO.

## Versioning

v1.2 - 2026-08-10: P6 added for the Freelancer time-tracking & invoicing product line
(DSRA-43..52) - client/billing/payment processing, Stripe processor DPA, PECR notes for
payment reminders, statutory financial retention (vs G6). v1.1 - 2026-08-08: G6 retention
& deletion schedule defined per data class (candidates 6 months post-decision, audit events
2 years archive, outbox 90 days, telemetry 90 days), dispute-hold rule, automated deletion
job requirement. v1 - 2026-08-07 draft. Placeholders for hosting/encryption confirmed with
CTO on 2026-08-08 (DSRA-37). Next review: 2026-09-01 or on change.
