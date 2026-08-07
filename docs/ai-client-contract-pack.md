# AI instructions-for-use + client contract pack

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-28 (deliverable), DSRA-25 (G5), DSRA-20, DSRA-6/10 (HR pilot), DSRA-22 (recruiting platform), DSRA-23 (cold-calling)
Status: Draft - template wording for CEO/sales review before use in live SOWs/contracts
Compliance: EU AI Act Art 13 (instructions for use) + Art 26 (deployer obligations), GDPR Art 28 (processors), UK/EU/SIG agreements

## Purpose

Pack for sales/CEO to include in client SOWs and contracts. It tells deployers what the
DSRVM AI systems do, their limitations, and what the client must do to use them lawfully
(EU AI Act Art 13 / 26). Covers HR automation screening (high-risk employment use), the
recruiting platform (DSRA-22), and cold-calling/outreach (transparency). Works alongside
the AI Acceptable Use Policy (DSRA-25) and DPIA (DSRA-26).

## How to use

- **In a sales SOW:** use Section A (what the AI does) + B (instructions for use) + C
  (your responsibilities as deployer) as contract appendices.
- **In data processing terms:** use Section D clauses in the DPA/Schedule.
- **Before a pilot demo:** confirm the client accepts the "human makes the final decision"
  operating model (B.1) and the disclosure requirement (C.2).
- Company-confidential: mark as template; fill per-engagement before sending.

---

## A. What the DSRVM AI system does (provider-side summary)

1. **Purpose:** assists recruiters in shortlisting candidates for a role. The system
   scores an applicant's profile against the role requirements supplied by the client and
   returns a recommendation (advance / reject / needs review) with a brief explanation.
2. **Human in the loop:** the recommendation is advisory. DSRVM's software requires a
   human reviewer to make the final decision before any action is taken on an applicant.
   Automated output never acts alone.
3. **Model & data:** scoring uses a third-party large language model (OpenAI/Anthropic)
   or a local model (Ollama) depending on deployment. Candidate data is used solely to
   assess fit for the role; it is not used to train the model, and DSRVM configures
   providers with no-training / zero-data-retention terms where available.
4. **Versioning & monitoring:** prompts and models are versioned; scoring is evaluated
   for quality and, in pilot, bias indicators before release. DSRVM monitors for drift and
   incidents (post-market monitoring per EU AI Act Art 72).

## B. Instructions for use (EU AI Act Art 13 - what DSRVM provides)

DSRVM provides the client the following on request and free of charge:

1. **Operating model:** recommendation-only; a human reviewer makes the final decision.
   Do not configure the system to act automatically on screening output without human
   review (this would breach the human-oversight design and Art 22/GDPR).
2. **Inputs:** the client supplies the role requirements and applicant data lawfully
   collected. Do not upload special-category data (health, ethnicity, religion, etc.)
   without DSRVM's prior written approval of a protocol (AUP section 2).
3. **Intended use:** candidate screening and shortlisting only. Do not use the system for
   any other purpose (credit, insurance, policing, etc.) - out of scope and may breach
   the EU AI Act.
4. **Expected outputs & performance:** recommendations are an aid, not a guarantee.
   DSRVM publishes eval metrics per model/prompt version; the client should review these
   before use.
5. **Limitations & errors:** the system may occasionally miss relevant experience or
   surface irrelevant flags. Always interpret outputs with human judgement. Do not make
   decisions based solely on the automated output.
6. **Misfunction reporting:** any suspected bias, discrimination, or safety issue must be
   reported to DSRVM immediately (incident process). DSRVM will investigate and, where
   required, pause the affected model version.
7. **Retention:** applicant data is retained per the retention schedule and deleted when
   the schedule expires or on the client's instruction.

## C. Deployer responsibilities (EU AI Act Art 26 - what the client agrees)

1. **Lawful basis:** the client confirms it has a lawful basis and, where needed, consent
   for processing applicant personal data and that it is authorised to share it with DSRVM.
2. **Transparency to candidates:** the client will tell candidates AI-assisted screening
   is used, that a human makes the final decision, and how to request human review /
   explanation (notice text provided - ai-candidate-notice.md).
3. **Human oversight:** the client will operate the human-in-the-loop control and ensure a
   trained person reviews each recommendation before action.
4. **No prohibited use:** the client will not use the system to make unlawful automated
   decisions, will not re-purpose it, and will not circumvent the human-review control.
5. **No unauthorised input:** the client will not feed credentials, secrets, children's
   data, or special-category data into the system without approval (AUP section 2).
6. **Records & audit:** the client will keep audit records of reviews for as long as
   DSRVM's retention schedule requires and will cooperate with DSRVM in any investigation.

## D. Data processing clauses (for DPA/Schedule)

1. **Roles:** DSRVM is a processor/technology provider of the client; the client is the
   controller of applicant data.
2. **Permitted purpose:** processing of applicant data solely to provide the screening
   service described in this agreement.
3. **No training:** DSRVM will not use client/candidate data to train AI models, and will
   flow down the same no-training requirement to its model providers.
4. **Sub-processors:** model providers (OpenAI/Anthropic or local models) listed in the
   vendor register; DSRVM will ensure contractual protections (DPA/SCCs where required)
   before processing candidate data via third parties.
5. **Security & location:** data is stored on DSRVM's infrastructure with encryption at
   rest/in transit and access controls; processing location per the engagement (confirm
   with CTO on data residency).
6. **Deletion:** on termination or expiry, DSRVM will delete or return applicant data per
   the retention/deletion schedule unless law requires otherwise.
7. **Breach notification:** DSRVM will notify the client of personal-data breaches without
   undue delay.

## E. Getting to execution

1. CEO/sales to add Sections A-D to the SOW/contract template for HR automation and
   recruiting platform engagements.
2. CTO to confirm data-residency + storage details for clause D.5 once unblocked.
3. Candidate notice (ai-candidate-notice.md) linked into clause C.2.
4. Version control: this is a template - legal review recommended before first live use.

## Versioning

v1 - 2026-08-07 draft. Review with CEO before first use in a live SOW.
