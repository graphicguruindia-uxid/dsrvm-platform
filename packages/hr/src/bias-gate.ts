import type { BiasScore, BiasSuiteOptions } from "@dsrvm/ai";
import { assessBiasSuite } from "@dsrvm/ai";
import type { ScreeningEngine } from "./screening.js";
import type { Candidate, RoleProfile } from "./types.js";
import { BIAS_ROLE, buildSyntheticCohorts } from "./bias-cohorts.js";

export interface BiasGateOptions {
  options?: BiasSuiteOptions;
  sampleLimit?: number;
}

export interface BiasGateResult {
  level: "PASS" | "WATCH" | "FAIL";
  screened: number;
  metrics: {
    group: string;
    n: number;
    meanScore: number;
    medianScore: number;
    advanceRate: number;
  }[];
  comparisons: {
    higherGroup: string;
    lowerGroup: string;
    selectionRatio: number;
    advanceRateDiff: number;
    cohensD: number;
    mannWhitneyU: number;
    pValue: number;
  }[];
  triggers: string[];
}

export async function runBiasGate(
  engine: ScreeningEngine,
  options: BiasGateOptions = {},
): Promise<BiasGateResult> {
  const role: RoleProfile = {
    id: "bias-gate-role",
    title: BIAS_ROLE.title,
    requirements: BIAS_ROLE.requirements,
    niceToHave: BIAS_ROLE.niceToHave,
    createdAt: new Date().toISOString(),
  };

  const cohorts = buildSyntheticCohorts();
  const scores: BiasScore[] = [];
  const sampleLimit = options.sampleLimit ?? Infinity;

  for (const cohort of cohorts) {
    const groups = [...new Set(cohort.profiles.map((p) => p.group))];
    const perGroup =
      sampleLimit === Infinity
        ? Infinity
        : Math.max(1, Math.floor(sampleLimit / groups.length));
    for (const group of groups) {
      const profiles = cohort.profiles.filter((p) => p.group === group);
      for (const profile of profiles.slice(0, perGroup)) {
        if (scores.length >= sampleLimit) break;
        const candidate: Candidate = {
          id: profile.id,
          roleId: role.id,
          name: profile.id,
          email: `${profile.id}@example.com`,
          resumeText: profile.resumeText,
          status: "pending_screening",
          screening: null,
          review: null,
          aiNoticeDisclosedAt: new Date().toISOString(),
          dispute: null,
          enrichment: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const result = await engine.screen(role, candidate);
        scores.push({
          profileId: profile.id,
          cohortId: cohort.id,
          group: profile.group,
          score: result.score,
          recommendation: result.recommendation,
        });
      }
    }
  }

  const assessment = assessBiasSuite(scores, options.options);
  return {
    level: assessment.level,
    screened: scores.length,
    metrics: assessment.metrics,
    comparisons: assessment.comparisons,
    triggers: assessment.triggers,
  };
}
