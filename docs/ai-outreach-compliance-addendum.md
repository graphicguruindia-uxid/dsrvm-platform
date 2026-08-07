# B2B outreach compliance addendum (PECR / UK GDPR / region matrix)

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-33 (deliverable), DSRA-24 (outbound pipeline), DSRA-30 (ROPA), DSRA-25 (AUP), DSRA-20
Status: Draft - apply to wave-1 before sends

## Purpose

Ready-to-use addendum for the Lead BDR / CEO when wave-1 sends get GO. Closes the
DSRA-24 AI Governance review FIX 1-3 findings. This is the "governance-conditioned GO"
package: footer text, LIA record, CRM field spec, region matrix, enrichment note.

## 1. Email footer (ready to paste into every marketing email)

Append to every cold/warm B2B outreach email:

```
---
You're receiving this because we found your public work at [Company] / we're connected via
[source]. We process business contact data under legitimate interests for B2B outreach
(UK GDPR Art 6(1)(f)). You can unsubscribe or ask us to stop contacting you at any time:
unsubscribe@dsrvmltd.co.uk | Privacy: [link to dsrvmltd.co.uk privacy page]
```

Rules:
- Use the same footer on LinkedIn messages? Not required - LinkedIn is its own platform
  with its own opt-out; but never message someone after they ask you to stop on any channel.
- For US-targeted emails (NAMER), also add a physical postal address line (CAN-SPAM):
  `DSRVM Ltd, [registered address], United Kingdom` plus the footer above.

## 2. Legitimate Interest Assessment (LIA) record template

Complete once per list-batch, store in the governance folder.

| Item | Record |
|---|---|
| Purpose | B2B outreach for DSRVM product lines (HR automation, AI consulting, web platform) |
| Data | Business contact name, title, company, work email/phone, LinkedIn; from network + public signals (news, job posts, company sites) |
| Legitimate interest test | DSRVM's interest: market its services to relevant businesses. Weighing: contacts are professionals acting in business capacity; low privacy impact (business data); contacts can object/opt-out easily; no sensitive data collected |
| Necessity | Direct outreach is necessary - no less-intrusive equivalent to reach prospective B2B clients |
| Safeguards | Opt-out footer, immediate suppression, data minimised to business contact fields, no children/special-category data, retention per schedule |
| Record-keeping | Completed by: ___, date: ___, next review: ___, approved by CEO |
| Objections | Any objection/opt-out is honoured within [24h] and recorded in crm-tracker.csv (optOut=true) |

## 3. CRM opt-out field spec

Add to crm-tracker.csv schema (aligns with Cold Calling kit's optOut field):

- `optOut` (bool, default false) - set true on any unsubscribe/objection.
- `unsubscribedAt` (date) - when the opt-out was received.
- `optOutSource` (channel) - email/linkedin/call/privacy-request.

Rule: any record with optOut=true is suppressed from ALL future sends and calls. The
suppression list takes priority over everything else. Cold Calling Agent must check this
before each dial.

## 4. Region compliance matrix

| Region | Email rule | Call rule | Notes |
|---|---|---|---|
| UK / EMEA | PECR: cold email to corporate subscribers allowed; individual/sole-trader subscribers need consent or soft opt-in. Include opt-out footer + valid sender. | Cold calls to corporate numbers permitted; identify DSRVM; do not call TPS-registered residential lines. | Primary wave-1; footer + opt-out required. |
| US (NAMER) | CAN-SPAM: valid postal address in every email + honour opt-outs (10 business days). | TCPA: avoid autodial/AI voice to mobile without consent - AI cold calls to mobile numbers need prior consent. | Add postal address line; verify AI-call consent rules. |
| Japan (APJ) | Opt-in required for commercial email (Act on Specified Commercial Transactions / APPI). | Consent-based; strict. | Do NOT cold email Japan without opt-in. |
| India (APAC) | DPDP Act 2023: consent-first; DPDP Rules phased to ~mid-2027 but design consent-first now. | Consent-based. | Treat as opt-in. |
| UAE / MENA | Respect local e-commerce/telecom rules; Sunday-Thursday windows. | Local licensing for outbound calls may apply. | Coordinate with regional compliance before non-UK dials. |

## 5. LinkedIn enrichment note (ToS-safe)

- Use Sales Navigator / LinkedIn-approved tooling or manual outreach - never automated
  profile scraping (ToS breach).
- Keep list provenance: network + public signals only. Document source per lead.
- No sends to unverified emails/phones (`<to-verify>` rule stays).

## 6. How to use

1. Lead BDR: add footer (Section 1) to outreach-playbook templates + wave-1 send drafts.
2. Lead BDR: add optOut fields (Section 3) to crm-tracker.csv schema.
3. AI Governance Officer: log LIA (Section 2) once per list batch; file in governance folder.
4. Apply region clauses (Section 4) before any non-UK wave.
5. Re-verify with AI Governance before first sends; then GO is fully conditioned.

## Versioning

v1 - 2026-08-07 draft. Review on region expansion or regulation change.
