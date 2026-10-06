import type {
  Candidate,
  RankBreakdown,
  RankedCandidate,
  RankExclusion,
  RankWeights,
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
