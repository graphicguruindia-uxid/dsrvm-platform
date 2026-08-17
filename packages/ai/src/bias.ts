export type BiasRecommendation = "advance" | "reject" | "needs_review";

export interface BiasProfile {
  id: string;
  group: string;
  resumeText: string;
}

export interface BiasCohort {
  id: string;
  label: string;
  groups: string[];
  profiles: BiasProfile[];
}

export interface BiasScore {
  profileId: string;
  cohortId: string;
  group: string;
  score: number;
  recommendation: BiasRecommendation;
}

export interface GroupMetric {
  group: string;
  n: number;
  meanScore: number;
  medianScore: number;
  advanceRate: number;
}

export interface BiasComparison {
  higherGroup: string;
  lowerGroup: string;
  selectionRatio: number;
  advanceRateDiff: number;
  cohensD: number;
  mannWhitneyU: number;
  pValue: number;
}

export type BiasLevel = "PASS" | "WATCH" | "FAIL";

export interface BiasResult {
  level: BiasLevel;
  metrics: GroupMetric[];
  comparisons: BiasComparison[];
  triggers: string[];
}

export interface BiasSuiteOptions {
  selectionRatioWatch?: number;
  selectionRatioFail?: number;
  cohensDWatch?: number;
  cohensDFail?: number;
  pValueSignificant?: number;
}

const DEFAULT_OPTIONS: Required<BiasSuiteOptions> = {
  selectionRatioWatch: 0.9,
  selectionRatioFail: 0.8,
  cohensDWatch: 0.1,
  cohensDFail: 0.2,
  pValueSignificant: 0.05,
};

export function assessBiasSuite(
  scores: readonly BiasScore[],
  options: BiasSuiteOptions = {},
): BiasResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = [...new Set(scores.map((s) => s.group))].sort();
  const metrics = groups.map((group) =>
    computeGroupMetric(
      group,
      scores.filter((s) => s.group === group),
    ),
  );

  const comparisons: BiasComparison[] = [];
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      comparisons.push(compareGroups(metrics[i]!, metrics[j]!, scores));
    }
  }

  const triggers: string[] = [];
  for (const comparison of comparisons) {
    if (comparison.selectionRatio < opts.selectionRatioFail) {
      triggers.push(
        `4/5ths rule FAIL: ${comparison.lowerGroup}/${comparison.higherGroup} selection ratio ${comparison.selectionRatio.toFixed(3)} < ${opts.selectionRatioFail}`,
      );
    } else if (comparison.selectionRatio < opts.selectionRatioWatch) {
      triggers.push(
        `4/5ths rule WATCH: ${comparison.lowerGroup}/${comparison.higherGroup} selection ratio ${comparison.selectionRatio.toFixed(3)} < ${opts.selectionRatioWatch}`,
      );
    }
    if (Math.abs(comparison.cohensD) >= opts.cohensDFail) {
      triggers.push(
        `Cohen's d FAIL: |${comparison.cohensD.toFixed(3)}| >= ${opts.cohensDFail} between ${comparison.lowerGroup} and ${comparison.higherGroup}`,
      );
    } else if (Math.abs(comparison.cohensD) >= opts.cohensDWatch) {
      triggers.push(
        `Cohen's d WATCH: |${comparison.cohensD.toFixed(3)}| >= ${opts.cohensDWatch} between ${comparison.lowerGroup} and ${comparison.higherGroup}`,
      );
    }
    if (comparison.pValue < opts.pValueSignificant) {
      triggers.push(
        `Statistically significant score difference (p=${comparison.pValue.toFixed(4)}) between ${comparison.lowerGroup} and ${comparison.higherGroup}`,
      );
    }
  }

  const fails = triggers.filter((t) => t.includes("FAIL"));
  const level: BiasLevel =
    fails.length > 0 ? "FAIL" : triggers.length > 0 ? "WATCH" : "PASS";

  return { level, metrics, comparisons, triggers };
}

function computeGroupMetric(
  group: string,
  samples: readonly BiasScore[],
): GroupMetric {
  const scores = samples.map((s) => s.score);
  const advances = samples.filter((s) => s.recommendation === "advance").length;
  return {
    group,
    n: samples.length,
    meanScore: mean(scores),
    medianScore: median(scores),
    advanceRate: samples.length === 0 ? 0 : advances / samples.length,
  };
}

function compareGroups(
  a: GroupMetric,
  b: GroupMetric,
  all: readonly BiasScore[],
): BiasComparison {
  const higher = a.advanceRate >= b.advanceRate ? a.group : b.group;
  const lower = a.advanceRate >= b.advanceRate ? b.group : a.group;
  const higherRate = Math.max(a.advanceRate, b.advanceRate);
  const lowerRate = Math.min(a.advanceRate, b.advanceRate);
  const selectionRatio = higherRate === 0 ? 0 : lowerRate / higherRate;

  const aScores = all.filter((s) => s.group === a.group).map((s) => s.score);
  const bScores = all.filter((s) => s.group === b.group).map((s) => s.score);
  const cohensD = effectSize(aScores, bScores);
  const { u, pValue } = mannWhitneyU(aScores, bScores);

  return {
    higherGroup: higher,
    lowerGroup: lower,
    selectionRatio,
    advanceRateDiff: Math.abs(a.advanceRate - b.advanceRate),
    cohensD,
    mannWhitneyU: u,
    pValue,
  };
}

export function renderBiasReportMarkdown(result: BiasResult): string {
  const lines: string[] = [
    "# Bias & disparate-impact test report",
    "",
    `**Result: ${result.level}**`,
    "",
    "## Group metrics",
    "",
    "| Group | n | Mean score | Median score | Advance rate |",
    "|---|---|---|---|---|",
  ];
  for (const metric of result.metrics) {
    lines.push(
      `| ${metric.group} | ${metric.n} | ${metric.meanScore.toFixed(2)} | ${metric.medianScore.toFixed(2)} | ${metric.advanceRate.toFixed(3)} |`,
    );
  }
  lines.push(
    "",
    "## Pairwise comparisons",
    "",
    "| Pair | Selection ratio | Advance rate diff | Cohen's d | p-value |",
  );
  for (const comparison of result.comparisons) {
    lines.push(
      `| ${comparison.lowerGroup} vs ${comparison.higherGroup} | ${comparison.selectionRatio.toFixed(3)} | ${comparison.advanceRateDiff.toFixed(3)} | ${comparison.cohensD.toFixed(3)} | ${comparison.pValue.toFixed(4)} |`,
    );
  }
  if (result.triggers.length > 0) {
    lines.push("", "## Triggers", "");
    for (const trigger of result.triggers) {
      lines.push(`- ${trigger}`);
    }
  } else {
    lines.push("", "No triggers. Parity within thresholds.");
  }
  return lines.join("\n");
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function pooledStdDev(a: readonly number[], b: readonly number[]): number {
  const nA = a.length;
  const nB = b.length;
  if (nA === 0 || nB === 0) return 0;
  const varA = variance(a);
  const varB = variance(b);
  return Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2));
}

function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return (
    values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / (values.length - 1)
  );
}

export function effectSize(a: readonly number[], b: readonly number[]): number {
  const sd = pooledStdDev(a, b);
  if (sd === 0) return 0;
  return (mean(a) - mean(b)) / sd;
}

export function mannWhitneyU(
  a: readonly number[],
  b: readonly number[],
): { u: number; pValue: number } {
  const nA = a.length;
  const nB = b.length;
  if (nA === 0 || nB === 0) {
    return { u: 0, pValue: 1 };
  }
  const ranked = rankScores([...a, ...b]);
  const rankSumA = a.reduce((sum, value) => sum + ranked.get(value)!, 0);
  const uA = nA * nB + (nA * (nA + 1)) / 2 - rankSumA;
  const u = Math.min(uA, nA * nB - uA);
  const meanU = (nA * nB) / 2;
  const sdU = Math.sqrt((nA * nB * (nA + nB + 1)) / 12);
  const z = sdU === 0 ? 0 : (u - meanU) / sdU;
  const pValue = 2 * normalSurvival(Math.abs(z));
  return { u, pValue };
}

function rankScores(values: readonly number[]): Map<number, number> {
  const sorted = [...values].sort((x, y) => x - y);
  const rankMap = new Map<number, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[i]) {
      j++;
    }
    const tieRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) {
      rankMap.set(sorted[k]!, tieRank);
    }
    i = j + 1;
  }
  return rankMap;
}

function normalSurvival(z: number): number {
  return 0.5 * (1 - erf(z / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}
