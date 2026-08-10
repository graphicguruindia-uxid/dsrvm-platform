export interface CandidateAiNotice {
  version: string;
  title: string;
  text: string;
}

export const CANDIDATE_AI_NOTICE_VERSION = "v1";

export function candidateAiNotice(): CandidateAiNotice {
  return {
    version: CANDIDATE_AI_NOTICE_VERSION,
    title: "AI-assisted application processing",
    text: [
      "Thank you for applying. To help our reviewers move quickly and fairly, your application is reviewed with the help of AI.",
      "AI assists, a human decides. An AI tool summarises how your application matches the role and suggests a shortlist. A human reviewer always makes the final decision about your application. No decision about you is made by AI alone.",
      "What is used. Your application details and CV are used only to assess your fit for the role you applied for. We do not use them for anything else without telling you.",
      "Right to human review. If you would prefer a purely human review of your application, or want a person to reconsider, just ask - contact details are below. A person will review your application again.",
      "Right to explanation. You can ask us for a simple explanation of how your application was assessed.",
      "Your data, kept safely. Your data is stored securely, only accessed by people who need it, and deleted once the hiring decision and any appeal period are complete. We never sell your data, and it is never used to train AI models.",
      "Contact. To ask a question, request a human review, or ask for your data to be removed, contact us at any time. See our privacy notice for details.",
    ].join("\n"),
  };
}
