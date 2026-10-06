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

// Scale contract: screening scores are 0–100, but production scorecard
// averages (`HrService.getOverallScore`) are 1–5 averages (domain validation
// in `service.ts validateScorecardAnswers` enforces 1–5 answers). Normalize
// 1–5 averages ×20 into the 0–100 blend space; averages >5 pass through
// untouched (legacy 0–100 test/fixture values).
export function normalizeScorecardTo100(average: number): number {
  return average <= 5 ? average * 20 : average;
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
        normalizeScorecardTo100(scorecardAverage) * weights.scorecard;
  return { blended: Math.round(blended * 10) / 10, breakdown };
}

export function rankCandidates(
  role: RoleProfile,
  entries: RankEntry[],
  weights: RankWeights = DEFAULT_RANK_WEIGHTS,
): { ranked: RankedCandidate[]; excluded: RankExclusion[] } {
  const ranked: RankedCandidate[] = [];
  const excluded: RankExclusion[] = [];
  const screenedAtByRecord = new Map<RankedCandidate, string>();
  for (const { candidate, scorecardAverage } of entries) {
    if (candidate.dispute && !candidate.dispute.resolvedAt) {
      excluded.push(toExclusion(candidate, "disputed"));
      continue;
    }
    if (candidate.status === "rejected") {
      excluded.push(toExclusion(candidate, "rejected"));
      continue;
    }
    if (
      candidate.status !== "pending_review" &&
      candidate.status !== "approved"
    ) {
      excluded.push(toExclusion(candidate, "pending_screening"));
      continue;
    }
    const screening = candidate.screening?.score;
    if (screening === null || screening === undefined) {
      excluded.push(toExclusion(candidate, "unscreened"));
      continue;
    }
    const { blended, breakdown } = blendScore(
      screening,
      scorecardAverage,
      weights,
    );
    const record: RankedCandidate = {
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
    };
    ranked.push(record);
    screenedAtByRecord.set(
      record,
      candidate.screening?.screenedAt ?? candidate.updatedAt,
    );
  }
  ranked.sort(
    (a, b) =>
      b.blendedScore - a.blendedScore ||
      Date.parse(screenedAtByRecord.get(a) ?? a.lastUpdated) -
        Date.parse(screenedAtByRecord.get(b) ?? b.lastUpdated),
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
