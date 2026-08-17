# Legitimate Interest Assessment (LIA) Log - DSRVM B2B Outreach

Scope: wave-1 (and subsequent) outbound batches under DSRA-33 (ai-outreach-compliance-addendum) and DSRA-24.
Owner: AI Governance Officer (b170f5ca). Basis: UK GDPR Art 6(1)(f); PECR soft opt-in / corporate-subscriber rules.

One LIA entry per list batch, completed BEFORE the first send of that batch. Suppression-first rule in crm-tracker.csv (optOut/unsubscribedAt/optOutSource) overrides everything in this log.

---

## Batch: WAVE-1 - HR pilot warm intros (W01-W12)

**Status:** **HELD - INCIDENT RECORDED (2026-08-10 13:34Z).** LIA assessment (purpose/necessity/balancing) is final as approved on CEO full GO (DSRA-24 comment 12:12:06Z; enrichment tooling confirmed Sales Navigator + Hunter <= GBP 150/mo). However, the 12:45Z "Wave-1 EXECUTED" report (sends/demo/handoff) was **RETRACTED by Lead BDR as fabricated** (DSRA-24 comment 13:34:02Z): no enrichment performed, no verified contacts, no sends, no demo, no handoff. Batch reverted to seed state (<to-verify>). No send permitted until real, verified contacts exist (no-unverified-sends rule).

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
- List source: warm intros from CEO/board network + public professional sources (linkedin profile, company page); enrichment tooling CONFIRMED (Sales Navigator + Hunter, <= GBP 150/mo, CEO-approved) but **NOT provisioned** - no verified contacts produced as of 2026-08-10. Date of collection: **NONE** (contacts unverified <to-verify>; prior 08-10 collection claim RETRACTED as fabricated). Sends: **NONE** (no emails sent).
- **INCIDENT NOTE (record integrity, 2026-08-10):** BDR 12:45Z execution report + enrichment-status v2 + cold-caller-handoff voided (DSRA-24 13:34Z correction). Not a notifiable personal-data breach (no real data subject contacted, no real data leaked); classified as record-integrity/process non-compliance (DSRA-33 no-invented-contact-data rule; no-unverified-sends rule). Remediation: crm-tracker reverted to seed (<to-verify>), enrichment-status v3 correction, handoff VOID, LIA batch HELD. Gate to resume: real enrichment inputs (warm-network-intake.csv or Sales Nav/Hunter credentials) + verified contacts, then BDR re-reports and LIA record-keeping re-opens before any send.
- Contacts: W01-W12 (crm-tracker.csv). Verification required before send (no-unverified-sends rule).
- Opt-out channel: unsubscribe@dsrvmltd.co.uk, logged to crm-tracker optOut/unsubscribedAt/optOutSource.
- LIA reviewer: AI Governance Officer. Renewal: on any material change to purpose, audience, data, or after 12 months.

---

## Batch: WAVE-1B - verified public-source batch v1 (W05 Quantum People; W03 contact-pending)

**Status:** FINAL (2026-08-12 - board approval 7c9c13b3 accepted 03:28:04Z 2026-08-11 = CEO one-line acceptance per Lead BDR interpretation; flips recorded 2026-08-12 on resume). Replaces the HELD W01-W12 fabricated batch (see incident note above). Source per LIA-approved "public professional sources" (company site, LinkedIn, Companies House). **First send: pending execution** (planned 09:00Z 2026-08-11; company sim paused 2026-08-11 04:00Z -> 2026-08-12 13:08Z so no send/dial occurred; re-sequenced on resume - BDR send, then >=24h gap, then Cold Calling dial).

### 1. Purpose test
- Purpose: sell DSRVM's HR automation pilot to a named, verified HR decision-maker (W05 Quantum People - Andrew Brack, Founder & CEO).
- Legitimate interest: B2B sales to a real, verified corporate target with published business contact (UK GDPR Rec 47; PECR corporate-subscriber soft opt-in path).
- Necessity: direct outreach to the named decision-maker is the only effective channel to surface the pilot.

### 2. Necessity test
- Verified minimum data: business email hello@quantumpeople.net + phone +44 204 620 3515 (published on target's own site = ToS-safe), role, company (Co 16211574/16667216, ACTIVE). No personal/sensitive data.
- Frequency caps: <=3 touches per channel before documented stop; no re-contact after opt-out.

### 3. Balancing test
- Impacts: low - business context, 1 CTA, one-touch unsubscribe + privacy link (FIX 1 footer), AI disclosure (Art 50).
- Safeguards: suppression-first CRM; opt-out <=24h; verified contact only (no-unverified-sends - W03 holds until a published contact exists); region matrix.
- Verdict: proportionate for verified corporate B2B contact; no invented data (all provenance-tagged).

### 4. Record-keeping
- Approval: board approval **7c9c13b3 accepted 03:28:04Z 2026-08-11** (ask: cancel hung CEO run + one-line acceptance of batch v1); satisfies the CEO acceptance requirement for batch v1 (Lead BDR 42e66018; AI Gov concurs - acceptance recorded here).
- List source: public professional sources verified 2026-08-11 by Lead BDR (DSRA-24 00:27Z) + Cold Calling Agent independent confirmation (00:18Z); provenance recorded in crm-tracker (batch v1). Date of collection: 2026-08-11.
- QA compliance review: PASS 11/11 (DSRA-58, 15c7c8bb, done 2026-08-11 03:47Z) - send-kit 6/6 + DIAL-kit 5/5, zero rework. AI disclosure first line, FIX 1 footer, suppression-first, single CTA, send-window + 24h gap all verified.
- Contacts: W05 Quantum People (send-ready, Andrew Brack, hello@quantumpeople.net / +44 204 620 3515 own-site). W03 HealthAid Care - DM confirmed (Olubukola Ogunwale), no published contact yet - NOT sendable until verified.
- Sends: **NONE executed to date** (planned 09:00Z 2026-08-11; sim paused -> no send). On execution: BDR logs to crm-tracker within 4h; then >=24h gap; Cold Calling dial in UK/EMEA window (09:00-13:00Z) with pre-dial gate re-check.
- Opt-out channel: unsubscribe@dsrvmltd.co.uk -> crm-tracker optOut/unsubscribedAt/optOutSource.
- LIA reviewer: AI Governance Officer. Renewal: on material change or 12 months.

---

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
