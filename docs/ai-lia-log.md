# Legitimate Interest Assessment (LIA) Log - DSRVM B2B Outreach

Scope: wave-1 (and subsequent) outbound batches under DSRA-33 (ai-outreach-compliance-addendum) and DSRA-24.
Owner: AI Governance Officer (b170f5ca). Basis: UK GDPR Art 6(1)(f); PECR soft opt-in / corporate-subscriber rules.

One LIA entry per list batch, completed BEFORE the first send of that batch. Suppression-first rule in crm-tracker.csv (optOut/unsubscribedAt/optOutSource) overrides everything in this log.

---

## Batch: WAVE-1 - HR pilot warm intros (W01-W12)

**Status:** FINAL (2026-08-10 - CEO full GO, DSRA-24 comment 12:12:06Z; enrichment tooling confirmed Sales Navigator + Hunter <= GBP 150/mo).

### 1. Purpose test (is the processing necessary for a legitimate purpose?)
- Purpose: sell DSRVM's HR automation pilot (CareerForge/@dsrvm/hr) to named HR decision-makers at prospect companies (warm-intro leads from founder/board network plus verified public contacts).
- Legitimate interest: B2B sales of a recruitment-efficiency product to the right audience, at the right time, with a clear opt-out. Explicitly recognised by UK GDPR Recital 47 for direct marketing (soft opt-in for existing customer analogue is not required for corporate subscriber cold contact under PECR, but individual/sole-trader subscribers need consent or soft opt-in - flagged per prospect).
- Necessity: outreach is the only reasonable channel to surface the pilot to these prospects; no less-intrusive method achieves the purpose (prospects are not existing customers).

### 2. Necessity test (is there a less intrusive means?)
- Alternative (ads/website) does not reach named decision-makers reliably.
- Minimum data used: business email, role title, company, business phone (no personal/sensitive data).
- Frequency caps: <=3 touches per channel before a documented stop; no re-contact after opt-out.

### 3. Balancing test (does the interest outweigh the individual's rights?)
- Impacts: low - business context, professional role, 1 CTA, one-touch unsubscribe + privacy link in every email (FIX 1 footer, DSRA-33).
- Safeguards: suppression-first CRM fields; honour opt-out within 24h; no-unverified-sends rule (<to-verify>); region matrix gating non-UK waves; AI disclosure on all AI-assisted content (EU AI Act Art 50).
- Transparency: Art 14 notice via footer + privacy page link; DSRA-27 candidate notice is separate (recruiting channel, not outreach).
- Verdict: LI is proportionate for corporate-subscriber B2B contact; individual/sole-trader contacts are excluded pending consent or soft opt-in.

### 4. Record-keeping
- List source: warm intros from CEO/board network + public professional sources (linkedin profile, company page); enrichment via Sales Navigator + Hunter (ToS-compliant, <= GBP 150/mo, CEO-confirmed 2026-08-10). Date of collection: 2026-08-10 (W01-W12 enriched/verified; BDR send report pending formalisation - enrichment date per Cold Calling task log 12:27Z).
- Contacts: W01-W12 (crm-tracker.csv). Verification required before send (no-unverified-sends rule).
- Opt-out channel: unsubscribe@dsrvmltd.co.uk, logged to crm-tracker optOut/unsubscribedAt/optOutSource.
- LIA reviewer: AI Governance Officer. Renewal: on any material change to purpose, audience, data, or after 12 months.

---

## Batch: [TEMPLATE - duplicate per batch]

**Status:** DRAFT / FINAL / SUPERSEDED

### 1. Purpose test
- Purpose:
- Legitimate interest:
- Necessity:

### 2. Necessity test
- Less intrusive means considered:
- Minimum data used:
- Frequency caps:

### 3. Balancing test
- Impacts:
- Safeguards:
- Transparency:
- Verdict:

### 4. Record-keeping
- List source / collection date:
- Contacts (ref crm-tracker.csv):
- Opt-out channel:
- LIA reviewer: AI Governance Officer. Renewal: on material change or 12 months.
