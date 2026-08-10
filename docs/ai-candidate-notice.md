# Candidate-facing AI transparency notice

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-27 (deliverable), DSRA-26 (DPIA control), DSRA-25 (G10), DSRA-20
Status: Draft - wording to be aligned with web copy (DSRA-16). **Placement in the HR flow: implemented 2026-08-10** - notice wired into `@dsrvm/hr` at application confirmation (`candidate.acknowledged` outbox + `candidate.ai_notice` audit at `pending_screening`) and included in every status email payload (ack/approved/rejected). No-bypass for all intake paths (API create + CSV/email ingest). Pre-flight checks in `scripts/qa-smoke.mts`.
Compliance: GDPR Art 13/14, Art 22(3); EU AI Act Art 13/50; EEO best practice

## Purpose

This is the plain-language notice shown to candidates whose application is processed with
AI-assisted screening in the DSRVM HR automation flow (and, later, the AI recruiting
platform DSRA-22). It satisfies the transparency duties in the DPIA (DSRA-26) and the
Acceptable Use Policy (DSRA-25). Placement: application page / email / confirmation
screen. Keep wording human, short, and truthful.

---

## Notice text (v1)

### AI-assisted application processing

Thank you for applying. To help our reviewers move quickly and fairly, your application is
reviewed with the help of AI.

**What this means:**

- **AI assists, a human decides.** An AI tool summarises how your application matches the
  role and suggests a shortlist. A human reviewer always makes the final decision about
  your application. No decision about you is made by AI alone.
- **What is used.** Your application details and CV are used only to assess your fit for
  the role you applied for. We do not use them for anything else without telling you.
- **Right to human review.** If you would prefer a purely human review of your application,
  or if you were assessed using automated means and want a person to reconsider, just ask
  (contact details below). We will make sure a person reviews your application again.
- **Right to explanation.** You can ask us for a simple explanation of how your application
  was assessed.
- **Your data, kept safely.** Your data is stored securely, only accessed by people who need
  it, and deleted once the hiring decision and any appeal period are complete. We never sell
  your data, and it is never used to train AI models.

**Contact:** [company email] | [phone] | [privacy page link]
To ask a question, request a human review, or ask for your data to be removed, contact us
at any time. [Link to privacy notice.]

---

## Implementation guidance (for engineering/web copy)

1. **Where it appears:** application confirmation screen + first status email to candidate.
   Minimum viable: a link titled "How we use AI in screening" on the application page with
   this text as the target page.
2. **Who sees it:** every candidate whose application enters the screening flow
   (`status: pending_screening`). Add to the same trigger that creates the audit event.
3. **No bypass:** the notice must appear before or at the point screening begins, matching
   the DPIA transparency control (R6).
4. **Aligned with AUP:** disclose AI in all candidate-facing surfaces (AUP 4). Do not bury
   the disclosure in fine print - it must be prominent.
5. **Language:** plain English; translate for any market where DSRVM posts roles
   (localisation triggers a review by the AI Governance Officer).

## Versioning

v1 - 2026-08-07 draft. Review wording with CEO/web copy (DSRA-16) before publishing.
