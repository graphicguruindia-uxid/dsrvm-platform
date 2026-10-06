import { describe, expect, it } from "vitest";
import { normalizeScorecardTo100, rankCandidates } from "./ranking.js";
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

  it("flags unscored when scorecard average is null and falls back to screening", () => {
    const a = cand({
      id: "a",
      screening: { score: 75 } as Candidate["screening"],
    });
    const { ranked, excluded } = rankCandidates(role, [
      { candidate: a, scorecardAverage: null },
    ]);
    expect(excluded).toEqual([]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.blendedScore).toBe(75);
    expect(ranked[0]?.breakdown.unscored).toBe(true);
    expect(ranked[0]?.breakdown.scorecard).toBeNull();
  });

  it("excludes rejected candidates", () => {
    const a = cand({
      id: "a",
      status: "rejected",
      screening: { score: 90 } as Candidate["screening"],
    });
    const { ranked, excluded } = rankCandidates(role, [
      { candidate: a, scorecardAverage: 90 },
    ]);
    expect(ranked).toEqual([]);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.reason).toBe("rejected");
    expect(excluded[0]?.candidateId).toBe("a");
  });

  it("excludes unscreened candidates with no screening result", () => {
    const a = cand({ id: "a", status: "pending_review", screening: null });
    const { ranked, excluded } = rankCandidates(role, [
      { candidate: a, scorecardAverage: 90 },
    ]);
    expect(ranked).toEqual([]);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.reason).toBe("unscreened");
  });

  it("excludes candidates with an unresolved dispute", () => {
    const a = cand({
      id: "a",
      screening: { score: 90 } as Candidate["screening"],
      dispute: {
        raisedAt: "2026-08-04T00:00:00.000Z",
        resolvedAt: null,
        note: "contested",
      },
    });
    const { ranked, excluded } = rankCandidates(role, [
      { candidate: a, scorecardAverage: 90 },
    ]);
    expect(ranked).toEqual([]);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.reason).toBe("disputed");
  });

  it("excludes candidates still pending screening", () => {
    const a = cand({
      id: "a",
      status: "pending_screening",
      screening: { score: 90 } as Candidate["screening"],
    });
    const { ranked, excluded } = rankCandidates(role, [
      { candidate: a, scorecardAverage: 90 },
    ]);
    expect(ranked).toEqual([]);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.reason).toBe("pending_screening");
  });

  it("breaks ties by earlier screenedAt even when updatedAt disagrees", () => {
    const early = cand({
      id: "early",
      screening: {
        score: 80,
        screenedAt: "2026-08-01T00:00:00.000Z",
      } as Candidate["screening"],
      updatedAt: "2026-08-05T00:00:00.000Z",
    });
    const late = cand({
      id: "late",
      screening: {
        score: 80,
        screenedAt: "2026-08-04T00:00:00.000Z",
      } as Candidate["screening"],
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const { ranked } = rankCandidates(role, [
      { candidate: late, scorecardAverage: 80 },
      { candidate: early, scorecardAverage: 80 },
    ]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.candidateId).toBe("early");
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.candidateId).toBe("late");
    expect(ranked[1]?.rank).toBe(2);
  });

  it("falls back to updatedAt for ties when screenedAt is missing", () => {
    const early = cand({
      id: "early",
      screening: { score: 80 } as Candidate["screening"],
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const late = cand({
      id: "late",
      screening: { score: 80 } as Candidate["screening"],
      updatedAt: "2026-08-05T00:00:00.000Z",
    });
    const { ranked } = rankCandidates(role, [
      { candidate: late, scorecardAverage: 80 },
      { candidate: early, scorecardAverage: 80 },
    ]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.candidateId).toBe("early");
    expect(ranked[1]?.candidateId).toBe("late");
  });

  it("returns empty ranked and excluded for empty input", () => {
    const { ranked, excluded } = rankCandidates(role, []);
    expect(ranked).toEqual([]);
    expect(excluded).toEqual([]);
  });

  it("normalizes 1–5 scorecard averages ×20 before blending", () => {
    const a = cand({
      id: "a",
      screening: { score: 80 } as Candidate["screening"],
    });
    const { ranked } = rankCandidates(role, [
      { candidate: a, scorecardAverage: 4 },
    ]);
    // 4 on the 1–5 scale → 80 on the 0–100 blend scale.
    expect(ranked[0]?.blendedScore).toBeCloseTo(0.7 * 80 + 0.3 * 80, 1);
    expect(ranked[0]?.blendedScore).toBe(80);
  });

  it("blends a perfect 1–5 scorecard above an unscored screening", () => {
    const a = cand({
      id: "a",
      screening: { score: 80 } as Candidate["screening"],
    });
    const { ranked } = rankCandidates(role, [
      { candidate: a, scorecardAverage: 5 },
    ]);
    // 5 on the 1–5 scale → 100 on the 0–100 blend scale.
    expect(ranked[0]?.blendedScore).toBe(86);
  });

  it("passes 0–100 scorecard averages through untouched", () => {
    expect(normalizeScorecardTo100(100)).toBe(100);
    expect(normalizeScorecardTo100(80)).toBe(80);
  });

  it("normalizes at the 1–5 boundary and passes through above it", () => {
    expect(normalizeScorecardTo100(5)).toBe(100);
    expect(normalizeScorecardTo100(5.1)).toBe(5.1);
  });
});
