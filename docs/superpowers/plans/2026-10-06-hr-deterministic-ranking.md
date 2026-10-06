# Deterministic Ranking (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank candidates per role deterministically from screening scores and scorecard averages, served by `GET /api/roles/:id/rank`, with role titles (never bare IDs) in payloads and views.

**Architecture:** Pure ranking engine in `packages/hr` (no LLM, no I/O) consumed by a thin `HrService.rankRole` method; the hr-automation app adds one GET route and enriches candidate payloads with `roleTitle`. Compare view switches from client-side sort to the server feed.

**Tech Stack:** TypeScript (strict), Vitest, Fastify (`inject` tests), PGlite-backed pg-store parity where touched (none here — reads only).

**Spec:** `docs/superpowers/specs/2026-10-06-hr-matching-ranking-communication-design.md` (§2 deterministic ranking, §6b role titles + compare feed)

## Global Constraints

- Deterministic only: no gateway/LLM calls anywhere in this plan.
- Eligibility: only `pending_review` and `approved` rank; rejected, unscreened, disputed are returned with reasons, never silently dropped or included.
- Default weights `{ screening: 0.7, scorecard: 0.3 }`; scorecard-less candidates rank on screening alone with `unscored: true`.
- Ties break by earlier `screenedAt`; blended scores rounded to 1 decimal.
- Unknown role id → `Error('role "<id>" not found')` → HTTP 404 (existing convention).
- TDD every task; commit per task; gates (`build`, `typecheck`, `lint`, `test`) green before the final commit.

---

## File map

- Create: `packages/hr/src/ranking.ts` — pure `rankCandidates` + weight/blend helpers.
- Create: `packages/hr/src/ranking.test.ts` — fixture tests.
- Modify: `packages/hr/src/types.ts` — add `RankWeights`, `RankBreakdown`, `RankedCandidate`, `RankExclusion`, `RoleRank`.
- Modify: `packages/hr/src/index.ts` — export `ranking.js` (check current export style first; it re-exports modules).
- Modify: `packages/hr/src/service.ts` — add `HrService.rankRole`.
- Modify: `packages/hr/src/service.test.ts` — rankRole tests (append new `describe`).
- Modify: `apps/hr-automation/src/server.ts` — add `GET /api/roles/:id/rank`; enrich `GET /api/candidates` (list + `:id` single) with `roleTitle`.
- Modify: `apps/hr-automation/src/server.test.ts` — route tests.
- Modify: `apps/hr-automation/src/dashboard.ts` — compare view uses `/api/roles/:id/rank` feed; replace bare `esc(m.roleId)` renders (lines ~702, ~875) with title resolution + ID fallback.
- Modify: `scripts/qa-smoke.mts` — rank endpoint + roleTitle smoke checks.

---

### Task 1: Rank domain types

**Files:**
- Modify: `packages/hr/src/types.ts` (append after `CandidateComparison`, ~line 258)

**Interfaces:**
- Consumes: existing `CandidateComparison`, `CandidateStatus`
- Produces: `RankWeights`, `RankBreakdown`, `RankedCandidate`, `RankExclusion`, `RoleRank` for Tasks 2–3

- [ ] **Step 1: Append the types**

```ts
export interface RankWeights {
  screening: number;
  scorecard: number;
}

export const DEFAULT_RANK_WEIGHTS: RankWeights = {
  screening: 0.7,
  scorecard: 0.3,
};

export interface RankBreakdown {
  screening: number;
  scorecard: number | null;
  weights: RankWeights;
  unscored: boolean;
}

export interface RankedCandidate extends CandidateComparison {
  rank: number;
  blendedScore: number;
  breakdown: RankBreakdown;
}

export type RankExclusionReason =
  | "rejected"
  | "unscreened"
  | "disputed"
  | "pending_screening";

export interface RankExclusion {
  candidateId: string;
  name: string;
  email: string;
  status: CandidateStatus;
  reason: RankExclusionReason;
}

export interface RoleRank {
  roleId: string;
  roleTitle: string;
  weights: RankWeights;
  ranked: RankedCandidate[];
  excluded: RankExclusion[];
  generatedAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dsrvm/hr typecheck`
Expected: PASS (types only, nothing consumes them yet)

- [ ] **Step 3: Commit**

```bash
git add packages/hr/src/types.ts
git commit -m "feat(hr): rank domain types (weights, breakdown, RankedCandidate, RoleRank)"
```

---

### Task 2: Pure ranking engine (TDD)

**Files:**
- Create: `packages/hr/src/ranking.ts`
- Create: `packages/hr/src/ranking.test.ts`
- Modify: `packages/hr/src/index.ts` (add export)

**Interfaces:**
- Consumes: Task 1 types; `Candidate`, `RoleProfile` from `./types.js`
- Produces: `rankCandidates(role, entries): { ranked; excluded }` for Task 3. Entry shape: `{ candidate: Candidate; scorecardAverage: number | null }` — the engine takes precomputed averages so it stays pure (no store access).

- [ ] **Step 1: Write the failing test**

```ts
// packages/hr/src/ranking.test.ts
import { describe, expect, it } from "vitest";
import { rankCandidates } from "./ranking.js";
import type { Candidate, RoleProfile } from "./types.js";

const role = { id: "r1", title: "Engineer" } as RoleProfile;

function cand(over: Partial<Candidate>): Candidate {
  return {
    id: "c",
    roleId: "r1",
    name: "N",
    email: "n@x.io",
    resumeText: "x",
    status: "pending_review",
    screening: null,
    review: null,
    aiNoticeDisclosedAt: null,
    dispute: null,
    enrichment: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    ...over,
  } as Candidate;
}

describe("rankCandidates", () => {
  it("blends screening and scorecard with default weights", () => {
    const a = cand({
      id: "a",
      screening: { score: 80 } as Candidate["screening"],
    });
    const { ranked, excluded } = rankCandidates(role, [
      { candidate: a, scorecardAverage: 100 },
    ]);
    expect(excluded).toEqual([]);
    expect(ranked[0]?.blendedScore).toBeCloseTo(0.7 * 80 + 0.3 * 100, 1);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.breakdown.unscored).toBe(false);
  });
});
```

(Write the full file with cases for: unscored flag when average is null;
excluded rejected / unscreened-no-screening / disputed / pending_screening;
tie broken by earlier `screenedAt`; empty input → empty ranked+excluded.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dsrvm/hr exec vitest run src/ranking.test.ts`
Expected: FAIL with "Failed to resolve import ./ranking.js"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/hr/src/ranking.ts
import type {
  Candidate,
  RankBreakdown,
  RankedCandidate,
  RankExclusion,
  RankWeights,
  DEFAULT_RANK_WEIGHTS as _unused,
  RoleProfile,
} from "./types.js";
import { DEFAULT_RANK_WEIGHTS } from "./types.js";

export interface RankEntry {
  candidate: Candidate;
  scorecardAverage: number | null;
}

export function blendScore(
  screening: number,
  scorecardAverage: number | null,
  weights: RankWeights = DEFAULT_RANK_WEIGHTS,
): { blended: number; breakdown: RankBreakdown } {
  const breakdown: RankBreakdown = {
    screening,
    scorecard: scorecardAverage,
    weights,
    unscored: scorecardAverage === null,
  };
  const blended =
    scorecardAverage === null
      ? screening
      : screening * weights.screening +
        scorecardAverage * weights.scorecard;
  return { blended: Math.round(blended * 10) / 10, breakdown };
}

export function rankCandidates(
  role: RoleProfile,
  entries: RankEntry[],
  weights: RankWeights = DEFAULT_RANK_WEIGHTS,
): { ranked: RankedCandidate[]; excluded: RankExclusion[] } {
  const ranked: RankedCandidate[] = [];
  const excluded: RankExclusion[] = [];
  for (const { candidate, scorecardAverage } of entries) {
    if (candidate.dispute && !candidate.dispute.resolvedAt) {
      excluded.push(toExclusion(candidate, "disputed"));
      continue;
    }
    if (candidate.status === "rejected") {
      excluded.push(toExclusion(candidate, "rejected"));
      continue;
    }
    if (candidate.status !== "pending_review" && candidate.status !== "approved") {
      excluded.push(toExclusion(candidate, "pending_screening"));
      continue;
    }
    const screening = candidate.screening?.score;
    if (screening === null || screening === undefined) {
      excluded.push(toExclusion(candidate, "unscreened"));
      continue;
    }
    const { blended, breakdown } = blendScore(screening, scorecardAverage, weights);
    ranked.push({
      candidateId: candidate.id,
      name: candidate.name,
      email: candidate.email,
      status: candidate.status,
      screeningScore: screening,
      overallScore: scorecardAverage ?? undefined,
      lastUpdated: candidate.updatedAt,
      rank: 0,
      blendedScore: blended,
      breakdown,
    });
  }
  ranked.sort(
    (a, b) =>
      b.blendedScore - a.blendedScore ||
      Date.parse(a.lastUpdated) - Date.parse(b.lastUpdated),
  );
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });
  void role;
  return { ranked, excluded };
}

function toExclusion(
  candidate: Candidate,
  reason: RankExclusion["reason"],
): RankExclusion {
  return {
    candidateId: candidate.id,
    name: candidate.name,
    email: candidate.email,
    status: candidate.status,
    reason,
  };
}
```

Notes for the implementer: `Candidate.screening` is `ScreeningResult | null`
(check `screening.score` — never assume non-null); `lastUpdated` reuses
`candidate.updatedAt` (no new timestamps in a pure function); `role` is
accepted for future requirement-weighted scoring but unused — the `void role`
documents that. Remove the unused `DEFAULT_RANK_WEIGHTS as _unused` import
line (left here only to flag it — do not commit it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dsrvm/hr exec vitest run src/ranking.test.ts`
Expected: PASS (all cases incl. ties, exclusions, unscored flag)

- [ ] **Step 5: Export + typecheck + commit**

Add `export * from "./ranking.js";` to `packages/hr/src/index.ts` (match the
existing `export *` style). Then:

Run: `pnpm --filter @dsrvm/hr typecheck`
Expected: PASS

```bash
git add packages/hr/src/ranking.ts packages/hr/src/ranking.test.ts packages/hr/src/index.ts
git commit -m "feat(hr): pure deterministic rank engine with exclusions and breakdowns"
```

---

### Task 3: `HrService.rankRole`

**Files:**
- Modify: `packages/hr/src/service.ts` (add method near `getOverallScore`, ~line 953)
- Modify: `packages/hr/src/service.test.ts` (append new `describe`)

**Interfaces:**
- Consumes: Task 2 `rankCandidates`, `RoleRank`; `store.roles.get`, `store.candidates.list`, existing `getOverallScore`
- Produces: `hr.rankRole(roleId, weights?): Promise<RoleRank>` for Task 4

- [ ] **Step 1: Write the failing test** (append to `service.test.ts`)

```ts
describe("rankRole", () => {
  it("ranks screened candidates and excludes the rest", async () => {
    const { hr } = setupService(); // ← use the file's existing setup helper
    const role = await hr.createRole({
      title: "Engineer",
      requirements: ["TypeScript"],
    });
    const mk = (name: string) =>
      hr.createCandidate({
        roleId: role.id,
        name,
        email: `${name}@x.io`,
        resumeText: "TypeScript expert",
        autoScreen: false,
      });
    const a = await mk("a");
    const b = await mk("b");
    const c = await mk("c");
    await hr.screenCandidate(a.id);
    await hr.screenCandidate(b.id);
    // c stays pending_screening → excluded
    const rank = await hr.rankRole(role.id);
    expect(rank.roleTitle).toBe("Engineer");
    expect(rank.ranked.map((r) => r.candidateId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(rank.excluded.map((e) => e.candidateId)).toEqual([c.id]);
  });

  it("throws not found for unknown roles", async () => {
    const { hr } = setupService();
    await expect(hr.rankRole("missing")).rejects.toThrow('role "missing" not found');
  });
});
```

Check the file's actual setup helper name first (`setupService` above is a
placeholder for whatever the file uses — read the top of `service.test.ts`
and use the real one; the demo/fake screening engine it wires determines
scores, so assert ordering relatively, e.g. `ranked[0].blendedScore >=
ranked[1].blendedScore`, not exact values).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dsrvm/hr exec vitest run src/service.test.ts -t "rankRole"`
Expected: FAIL with "hr.rankRole is not a function"

- [ ] **Step 3: Write minimal implementation** (in `HrService`, after `getOverallScore`)

```ts
async rankRole(roleId: string, weights?: RankWeights): Promise<RoleRank> {
  const role = await this.store.roles.get(roleId, this.tid);
  if (!role) {
    throw new Error(`role "${roleId}" not found`);
  }
  const all = await this.store.candidates.list(this.tid);
  const mine = all.filter((c) => c.roleId === roleId);
  const entries = [];
  for (const candidate of mine) {
    entries.push({
      candidate,
      scorecardAverage: await this.getOverallScore(candidate.id),
    });
  }
  const { ranked, excluded } = rankCandidates(role, entries, weights);
  return {
    roleId: role.id,
    roleTitle: role.title,
    weights: weights ?? DEFAULT_RANK_WEIGHTS,
    ranked,
    excluded,
    generatedAt: this.now().toISOString(),
  };
}
```

Add imports: `rankCandidates` from `./ranking.js`; `RoleRank`, `RankWeights`,
`DEFAULT_RANK_WEIGHTS` from `./types.js`. (N+1 `getOverallScore` reads are
accepted for v1 — roles have tens of candidates, not thousands; note it in
the commit message.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dsrvm/hr exec vitest run src/service.test.ts`
Expected: PASS (whole file — no regressions)

- [ ] **Step 5: Commit**

```bash
git add packages/hr/src/service.ts packages/hr/src/service.test.ts
git commit -m "feat(hr): HrService.rankRole with role-title output and not-found guard"
```

---

### Task 4: `GET /api/roles/:id/rank` route

**Files:**
- Modify: `apps/hr-automation/src/server.ts` (add route near the roles routes, ~line 541)
- Modify: `apps/hr-automation/src/server.test.ts` (append tests)

**Interfaces:**
- Consumes: Task 3 `hr.rankRole`
- Produces: `GET /api/roles/:id/rank → 200 RoleRank | 404` for Task 5

- [ ] **Step 1: Write the failing test** (follow the file's existing
`buildTenant`/`inject` helper pattern)

```ts
it("ranks candidates for a role", async () => {
  const { app, tenantId, inject } = await buildTenant();
  const role = (
    await app.server.inject({
      method: "POST",
      url: "/api/roles",
      headers: { "x-tenant-id": tenantId },
      payload: { title: "Engineer", requirements: ["TypeScript"] },
    })
  ).json().role;
  await app.server.inject({
    method: "POST",
    url: "/api/candidates",
    headers: { "x-tenant-id": tenantId },
    payload: {
      roleId: role.id,
      name: "Ada",
      email: "ada@x.io",
      resumeText: "TypeScript expert",
    },
  });
  const res = await app.server.inject({
    method: "GET",
    url: `/api/roles/${role.id}/rank`,
    headers: { "x-tenant-id": tenantId },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().roleTitle).toBe("Engineer");
  expect(res.json().ranked).toHaveLength(1);

  const missing = await app.server.inject({
    method: "GET",
    url: "/api/roles/missing/rank",
    headers: { "x-tenant-id": tenantId },
  });
  expect(missing.statusCode).toBe(404);
  await app.close();
});
```

(Read `server.test.ts` first: confirm the helper names and whether auth
headers beyond `x-tenant-id` are needed — mirror the file's role-creation
test exactly. Adjust candidate payload to whatever the intake route requires.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dsrvm/hr-automation exec vitest run src/server.test.ts -t "ranks candidates"`
Expected: FAIL with 404 (no route)

- [ ] **Step 3: Write minimal implementation**

```ts
server.get<{ Params: { id: string } }>(
  "/api/roles/:id/rank",
  async (request, reply) => {
    try {
      return await hr.rankRole(request.params.id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      throw error;
    }
  },
);
```

Place it directly after the `GET /api/roles` handler (~line 541) to keep
role routes together.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dsrvm/hr-automation exec vitest run src/server.test.ts`
Expected: PASS (whole file)

- [ ] **Step 5: Commit**

```bash
git add apps/hr-automation/src/server.ts apps/hr-automation/src/server.test.ts
git commit -m "feat(hr-automation): GET /api/roles/:id/rank with 404 guard"
```

---

### Task 5: Role titles in payloads + compare-view server feed

**Files:**
- Modify: `apps/hr-automation/src/server.ts` (`GET /api/candidates` list + `:id` single handlers)
- Modify: `apps/hr-automation/src/server.test.ts` (payload assertions)
- Modify: `apps/hr-automation/src/dashboard.ts` (compare view feed + bare-ID renders)
- Modify: `scripts/qa-smoke.mts` (rank + roleTitle checks)

**Interfaces:**
- Consumes: Task 4 route; existing `hr.listRoles()`, roleMap pattern
- Produces: `roleTitle` on candidate payloads; compare view fed by server rank

- [ ] **Step 1: Enrich list payloads (TDD)**

Add to `server.test.ts` (extend an existing candidates-list test or append):

```ts
expect(res.json().candidates[0]).toMatchObject({ roleTitle: "Engineer" });
```

Run it, watch it fail (`roleTitle` undefined), then enrich the `GET
/api/candidates` handler:

```ts
let candidates = await hr.listCandidates();
const roles = await hr.listRoles();
const titles = new Map(roles.map((r) => [r.id, r.title]));
// …after existing status/q filters and before paging…
const withTitles = candidates.map((c) => ({
  ...c,
  roleTitle: titles.get(c.roleId) ?? c.roleId,
}));
```

Apply the same enrichment to the single-candidate handler (`GET
/api/candidates/:id`, ~line 941). Fallback is the raw ID — views never break
when a role is deleted.

- [ ] **Step 2: Dashboard compare view → server feed**

In `dashboard.ts` `render_compare`: fetch `/api/roles` for a role picker
(default: first role), then `GET /api/roles/${roleId}/rank` and render
`ranked` rows (Rank, Name, Blended, Screening, Scorecard-or-—, Recommendation
via the candidate record, AI flag column reserved as "—" until Plan B) plus
an `excluded` section with reasons. Keep the name filter input; drop the
client-side score sort (server owns ordering now). Render `c.roleTitle ??
roleMap[c.roleId]` everywhere a role appears.

- [ ] **Step 3: Fix bare-ID renders**

Replace `esc(m.roleId)` at dashboard lines ~702 and ~875 with the title
lookup used at line 546 (`roleMap[…] || esc(m.roleId)`) — title first, ID
fallback. Verify no other `roleId}` render sites remain:

Run: `rg "roleId\}" apps/hr-automation/src/dashboard.ts`
Expected: only data attributes / form values, no visible text renders.

- [ ] **Step 4: Smoke checks** (append to the web… hr section of `qa-smoke.mts`,
after the rank-relevant setup — mirror the style of neighboring checks)

```ts
const rank = await call(server, {
  method: "GET",
  url: `/api/roles/${roleId}/rank`,
});
check(
  "GET /api/roles/:id/rank -> 200 ranked",
  rank.statusCode === 200 && rank.json().ranked.length >= 1,
  rank.json(),
);
```

(Reuse the `roleId`/`candidateId` variables already in scope in that block;
add a `roleTitle` assertion to the existing candidates-list check.)

- [ ] **Step 5: Full gates + commit**

Run: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
Expected: 11 / 15 / 11 / 15 tasks green (test counts grow — that's fine)

```bash
git add apps/hr-automation/src/server.ts apps/hr-automation/src/server.test.ts apps/hr-automation/src/dashboard.ts scripts/qa-smoke.mts
git commit -m "feat(hr-automation): roleTitle payloads, compare-view server feed, rank smoke checks"
```

---

## Self-review

- [x] **Spec coverage:** §2 (engine → T1+T2, service → T3, endpoint → T4),
  §6b role titles + compare feed (T5). LLM compare (§3), comms (§4),
  compliance (§5), AI detection (§6a), scorecard panels (§6b remainder) are
  explicitly Plans B–D, not this plan. No orphan spec requirements.
- [x] **Placeholders:** every step has exact code/commands; the two
  read-first notes (test helper names, intake payload shape) name the file
  and what to mirror.
- [x] **Type consistency:** `RankWeights`, `RankBreakdown`, `RankedCandidate`
  (`extends CandidateComparison`), `RankExclusion`, `RoleRank`,
  `rankCandidates(role, entries, weights?)`, `hr.rankRole(roleId,
  weights?)` — identical across tasks. `DEFAULT_RANK_WEIGHTS` lives in
  `types.ts`, imported everywhere from there.
