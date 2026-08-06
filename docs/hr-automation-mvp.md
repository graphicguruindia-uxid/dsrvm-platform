# HR Automation MVP v1 (@dsrvm/hr)

**Issue:** DSRA-6 | **Milestone:** M2.1 of tech-roadmap | **Status:** Done | **Date:** 2026-08-04

## Purpose
Automate the candidate intake -> screening -> human review -> action loop for DSRVM's HR automation product line. This is the recommended first revenue-bearing build: it reuses the @dsrvm/ai delivery kit and turns the sales/marketing narrative ("AI-powered recruitment") into a working, demoable pipeline with an audit trail.

## Design
Single-tenant, event-driven pipeline with human-in-the-loop at the decision point:

```
ingest (candidate.created)
  -> normalize (pending_screening)
  -> AI screen (pending_review)  [structured LLM screening via @dsrvm/ai]
  -> human review (approved | rejected)   [reviewer, note]
  -> action (outbox: candidate.approved | candidate.rejected)
```

Every state transition is recorded to an immutable audit log. Decisions fan out through a transactional outbox so downstream effects (email, scheduling, CRM) are reliably dispatched exactly once.

## Package: packages/hr
- `@dsrvm/hr` v0.1.0, ESM + strict TypeScript, depends on `@dsrvm/ai` (workspace).
- `src/types.ts` — domain model: `RoleProfile`, `Candidate`, `CandidateStatus`, `ScreeningResult`, `ScreeningRecommendation`, `ReviewDecision`, `AuditEvent`, `OutboxEvent`, `CreateCandidateInput`, `ReviewInput`.
- `src/store.ts` — `Store` interface + in-memory implementations (`CandidateStore`, `RoleStore`, `AuditStore`, `OutboxStore`); persistence backend can be swapped without touching the service.
- `src/screening.ts` — `ScreeningEngine` over the LLM gateway: `PromptRegistry`-versioned `screening` prompt, `generateStructured` with JSON-schema validation (score 0-100, recommendation, summary, strengths, flags), score clamping, retry-on-invalid.
- `src/service.ts` — `HrService`: `createRole`, `createCandidate`, `screenCandidate`, `reviewCandidate`, `listCandidates`, `auditLog`, `pendingOutbox`, `dispatchOutbox`. Enforces state-machine guards (e.g. cannot review before screening; unknown candidates throw).
- `src/index.ts` — public exports.

## Validation
- Tests: `screening.test.ts` (4) + `service.test.ts` (4) = **8 passed** covering structured screening, score clamping, invalid-JSON failure, full happy path, rejection path, transition guards, and audit-trail integrity.
- Monorepo (turbo): build 9/9, test 9/9 (ai 26 + hr 8 + others), typecheck 9/9, lint 8/8 — all green.
- CI-ready: same task graph as existing packages.

## Demo flow
```ts
const gateway = createGateway(/* anthropic|openai|fake */);
const store = createInMemoryStore();
const hr = new HrService({ store, screeningEngine: createScreeningEngine(gateway) });

const role = await hr.createRole({ title: "Founding Engineer", requirements: ["TypeScript", "AI"] });
const cand = await hr.createCandidate({ roleId: role.id, name: "Ada", email: "ada@x.io", resumeText });
await hr.screenCandidate(cand.id);              // AI screening -> pending_review
await hr.reviewCandidate(cand.id, { approved: true, reviewer: "hiring-mgr" });
await hr.dispatchOutbox(async (e) => email(e.payload.email, e.type));  // action, exactly once
```

## Follow-ups (next iterations)
- M2.2: Postgres + Drizzle persistence for the four stores; real scheduler for outbox dispatch.
- M2.3: Ingest adapters (ATS import, email-to-candidate), document parsing, resume file upload.
- M2.4: Reviewer UI (apps/hr-automation) with candidate queue + approve/reject, wired to the API.
- Telemetry hooks once DSRA-8 (usage/cost capture) lands.
