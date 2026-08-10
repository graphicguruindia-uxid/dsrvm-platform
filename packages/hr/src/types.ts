export type CandidateStatus =
  "pending_screening" | "pending_review" | "approved" | "rejected";

export type ScreeningRecommendation = "advance" | "reject" | "needs_review";

export interface RoleProfile {
  id: string;
  title: string;
  requirements: string[];
  niceToHave: string[];
  createdAt: string;
}

export interface Candidate {
  id: string;
  roleId: string;
  name: string;
  email: string;
  resumeText: string;
  status: CandidateStatus;
  screening: ScreeningResult | null;
  review: ReviewDecision | null;
  aiNoticeDisclosedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningResult {
  score: number;
  recommendation: ScreeningRecommendation;
  summary: string;
  strengths: string[];
  flags: string[];
  provider: string;
  model: string;
  screenedAt: string;
}

export interface ReviewDecision {
  approved: boolean;
  reviewer: string;
  note: string | null;
  decidedAt: string;
}

export interface AuditEvent {
  id: string;
  candidateId: string | null;
  action: string;
  detail: unknown;
  at: string;
}

export interface OutboxEvent {
  id: string;
  type: string;
  candidateId: string;
  payload: unknown;
  at: string;
  dispatchedAt: string | null;
}

export interface CreateCandidateInput {
  roleId: string;
  name: string;
  email: string;
  resumeText: string;
}

export interface ReviewInput {
  approved: boolean;
  reviewer: string;
  note?: string;
}
