import type { LlmGateway } from "@dsrvm/ai";
import {
  PromptRegistry,
  definePrompt,
  generateStructured,
  renderPrompt,
} from "@dsrvm/ai";
import type { JsonSchema } from "@dsrvm/ai";
import type {
  Candidate,
  RoleProfile,
  ScreeningResult,
  ScreeningRecommendation,
} from "./types.js";

export interface ScreeningEngine {
  screen(role: RoleProfile, candidate: Candidate): Promise<ScreeningResult>;
}

const SCREENING_SCHEMA: JsonSchema = {
  type: "object",
  required: ["score", "recommendation", "summary", "strengths", "flags"],
  properties: {
    score: { type: "number" },
    recommendation: { type: "string" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    flags: { type: "array", items: { type: "string" } },
  },
};

export const SCREENING_PROMPT = definePrompt({
  key: "screening",
  version: 1,
  template:
    "Screen the following candidate against the role.\n" +
    "Role title: {roleTitle}\n" +
    "Requirements: {requirements}\n" +
    "Nice to have: {niceToHave}\n" +
    "\n" +
    "Candidate resume:\n{resume}\n" +
    "\n" +
    "Return a JSON object with fields: score (0-100 number), " +
    'recommendation (exactly one of "advance" | "reject" | "needs_review"), ' +
    "summary (1-3 sentence string), strengths (array of strings), flags (array of strings for concerns).",
  description:
    "Screen a candidate against a role profile and produce a structured recommendation",
});

interface StructuredScreening {
  score: number;
  recommendation: ScreeningRecommendation;
  summary: string;
  strengths: string[];
  flags: string[];
}

export function createScreeningEngine(gateway: LlmGateway): ScreeningEngine {
  const registry = new PromptRegistry();
  registry.register(SCREENING_PROMPT);

  return {
    async screen(
      role: RoleProfile,
      candidate: Candidate,
    ): Promise<ScreeningResult> {
      const prompt = registry.latest("screening");
      let userContent = renderPrompt(prompt, {
        roleTitle: role.title,
        requirements: role.requirements.join(", "),
        niceToHave: role.niceToHave.join(", "),
        resume: candidate.resumeText,
      });

      if (candidate.enrichment) {
        const { score, pii, source } = candidate.enrichment;
        const flags = pii.length > 0 ? pii.join(", ") : "none";
        const origin = source
          ? `${source} candidate score`
          : "External candidate score";
        userContent +=
          `\n\nExternal enrichment (${origin}): ${score}/100. ` +
          `PII detected in resume: ${flags}. Treat as context only; ` +
          "base the recommendation on the resume content itself.";
      }

      const { data } = await generateStructured<StructuredScreening>(
        gateway,
        [{ role: "user", content: userContent }],
        SCREENING_SCHEMA,
        { maxRetries: 2 },
      );

      return {
        score: clampScore(data.score),
        recommendation: data.recommendation,
        summary: data.summary,
        strengths: data.strengths,
        flags: data.flags,
        provider: gateway.activeProvider,
        model: "structured-llm",
        screenedAt: new Date().toISOString(),
      };
    },
  };
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
