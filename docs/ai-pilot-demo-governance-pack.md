# HR pilot demo governance pack (client-facing)

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-31 (deliverable), DSRA-27 (candidate notice), DSRA-28 (contract pack), DSRA-26 (DPIA), DSRA-6/10 (HR pilot), DSRA-25 (AUP)
Status: Draft - review with CEO before the demo

## Purpose

One-page-per-question pack for the HR automation pilot demo. It tells the prospective
pilot client exactly what DSRVM's AI does, what DSRVM promises on data, and what the client
must do. Keeps the demo honest, on-script, and compliant with the DPIA (DSRA-26) and EU AI
Act transparency duties (Art 13/50).

## What the demo shows

- Candidate intake (CSV / email / resume extraction) -> AI-assisted shortlisting ->
  human reviewer approve/reject queue -> audit trail -> telemetry of cost per screening.
- A human makes every final decision; the AI recommends only.

## The governance story (say it out loud)

1. **AI assists, a human decides.** The system scores applicants against the role
   requirements you supply and suggests shortlist/not-shortlist. A DSRVM-approved human
   reviewer makes the final decision. No automated decision is ever taken alone.
2. **What we collect.** Name, email, resume/CV text, and application details - only to
   assess fit for the role. Nothing else.
3. **Your candidates are protected.** Their data is not used to train AI models, is stored
   securely, accessed only by people who need it, and deleted after the hiring decision
   and any appeal period.
4. **Transparency.** Candidates are told AI-assisted screening is used (plain-language
   notice - ai-candidate-notice.md, DSRA-27) and can request a human review or an
   explanation of how they were assessed.
5. **Fairness.** We test the screening model for bias across protected groups before it
   scales (ai-bias-testing-protocol.md, DSRA-29) and re-run on any model/prompt change.
6. **You stay in control.** The client confirms the lawful basis to process applicant
   data, tells candidates AI is used, and keeps the human-review control on (contract pack
   Section C, DSRA-28).

## The demo one-liner

"DSRVM screens applicants with AI that recommends and humans that decide - transparent,
audited, and never trained on your data."

## Client questions & answers (brief)

| Question | Answer |
|---|---|
| Does AI decide who gets hired? | No. It recommends; a human reviewer always makes the final call. |
| Is our data used to train models? | No. DSRVM configures providers with no-training / zero-data-retention terms. |
| What do candidates know? | They see a plain-language notice and can request human review / explanation. |
| How do you stop bias? | We test for disparate impact before scaling and on every model/prompt change. |
| What do we need to do? | Confirm lawful basis, show the notice to candidates, and operate the human-review control. |
| Where is the data stored? | On DSRVM infrastructure; processing location confirmed with our CTO before the pilot goes live. |
| What happens on termination? | Data is deleted or returned per the retention/deletion schedule (being finalised - DSRA-25 G6). |

## What to hand to the client after a positive demo

1. The candidate notice text (ai-candidate-notice.md) - they will show this to candidates.
2. The instructions-for-use / contract pack summary (ai-client-contract-pack.md) - the
   operating model and their responsibilities.
3. The pilot SOW wording (CEO/sales) - fold in contract pack Sections A-D.
4. Point them at the DPIA summary (ai-dpia-hr-screening.md) - we are a processor; they
   are controller of applicant data.

## Open items before the demo goes live

1. CTO to confirm hosting region / data residency + encryption (DSRA-26 pending item,
   CTO 2 now running).
2. Retention/deletion job (G6) to be scheduled pre-production.
3. Candidate notice placement in the flow (DSRA-27) once CTO wires it.
4. CEO to sign the AUP (DSRA-25) so the policy layer is in force.

## Versioning

v1 - 2026-08-07 draft. Review with CEO before the demo.
