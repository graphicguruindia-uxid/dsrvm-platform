import type { ParsedCandidate, CandidateSource } from "./types.js";
import { extractResumeText, detectPii } from "./resume.js";

export interface CareerForgeResumeInput {
  name: string;
  email: string;
  resumeText: string;
  externalId?: string;
}

export interface CareerForgeResumeOutput {
  parsed: ParsedCandidate;
  piiFlags: string[];
}

export function adaptCareerForgeResume(
  input: CareerForgeResumeInput,
): CareerForgeResumeOutput {
  const { text, pii } = extractResumeText(input.resumeText);
  return {
    parsed: {
      name: input.name,
      email: input.email,
      resumeText: text,
      source: "manual" as CandidateSource,
      externalId: input.externalId,
    },
    piiFlags: pii,
  };
}

export function detectCareerForgePii(text: string): string[] {
  return detectPii(text);
}
