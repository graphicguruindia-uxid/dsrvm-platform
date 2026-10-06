export type DataResidency = "EU" | "US" | "UK" | "GLOBAL";

export type AiComplianceMode = "strict" | "standard" | "off";

export interface TenantSettings {
  /** Ordered HR stages, e.g. ["sourcing","screening","interview","offer","onboarding"]. */
  workflowStages: string[];
  dataResidency: DataResidency;
  aiComplianceMode: AiComplianceMode;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
  settings?: TenantSettings;
}

export interface CreateTenantInput {
  name: string;
}

export type UserRole = "hr_admin" | "recruiter" | "executive";

export interface UserAccess {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type PolicyCategory =
  "ai_governance" | "data_retention" | "hiring" | "compliance" | "custom";

export interface Policy {
  id: string;
  tenantId: string;
  title: string;
  category: PolicyCategory;
  /** Markdown / plain text body. */
  content: string;
  /** Starts at 1, bumped when content changes on update. */
  version: number;
  /** Only active policies are enforced. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceCheck {
  policiesActive: number;
  policiesTotal: number;
  complianceMode: AiComplianceMode;
  dataResidency: DataResidency;
  /** Candidates with aiNoticeDisclosedAt set / total candidates (0 when no candidates). */
  aiDisclosureRate: number;
  disputesOpen: number;
  disputesResolved: number;
  workflowStages: string[];
  /** Human-readable warnings. */
  flags: string[];
}

export type CandidateStatus =
  "pending_screening" | "pending_review" | "approved" | "rejected";

export type ScreeningRecommendation = "advance" | "reject" | "needs_review";

export interface RoleProfile {
  id: string;
  title: string;
  requirements: string[];
  niceToHave: string[];
  createdAt: string;
  tenantId?: string;
  /** Normalized, deduped skill tags (comma-separated on input). */
  skills?: string[];
  experienceMinYears?: number;
  experienceMaxYears?: number;
  budgetMin?: number;
  budgetMax?: number;
  /** ISO 4217 currency code for budgetMin/budgetMax. Defaults to "USD". */
  budgetCurrency?: string;
  updatedAt?: string;
}

export interface CreateRoleInput {
  title: string;
  requirements: string[];
  niceToHave?: string[];
  skills?: string[];
  experienceMinYears?: number;
  experienceMaxYears?: number;
  budgetMin?: number;
  budgetMax?: number;
  budgetCurrency?: string;
}

export interface UpdateTenantSettingsInput {
  workflowStages?: string[];
  dataResidency?: DataResidency;
  aiComplianceMode?: AiComplianceMode;
}

export interface CreateUserAccessInput {
  email: string;
  role: UserRole;
}

export interface UpdateUserAccessInput {
  role: UserRole;
}

export interface CreatePolicyInput {
  title: string;
  category: PolicyCategory;
  content: string;
}

export interface UpdatePolicyInput {
  title?: string;
  category?: PolicyCategory;
  content?: string;
  active?: boolean;
}

export interface UpdateRoleInput {
  title?: string;
  requirements?: string[];
  niceToHave?: string[];
  skills?: string[];
  experienceMinYears?: number;
  experienceMaxYears?: number;
  budgetMin?: number;
  budgetMax?: number;
  budgetCurrency?: string;
}

export interface UpdateScorecardInput {
  reviewerName?: string;
  answers?: ScorecardAnswer[];
}

export interface DisputeRecord {
  raisedAt: string;
  resolvedAt: string | null;
  note: string | null;
}

export interface CandidateEnrichment {
  score: number;
  pii: string[];
  source?: string;
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
  dispute: DisputeRecord | null;
  enrichment: CandidateEnrichment | null;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
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
  tenantId?: string;
}

export interface OutboxEvent {
  id: string;
  type: string;
  candidateId: string;
  payload: unknown;
  at: string;
  dispatchedAt: string | null;
  tenantId?: string;
}

export interface CreateCandidateInput {
  roleId: string;
  name: string;
  email: string;
  resumeText: string;
  autoScreen?: boolean;
}

export interface EnrichCandidateInput {
  score: number;
  pii?: string[];
  source?: string;
}

export interface ReviewInput {
  approved: boolean;
  reviewer: string;
  note?: string;
}

export interface ScorecardAnswer {
  questionId: string;
  score: number;
  comment?: string;
}

export interface Scorecard {
  id: string;
  candidateId: string;
  reviewerId: string;
  reviewerName: string;
  answers: ScorecardAnswer[];
  overallScore: number;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

export interface CandidateComparison {
  candidateId: string;
  name: string;
  email: string;
  status: CandidateStatus;
  screeningScore?: number;
  overallScore?: number;
  lastUpdated: string;
}

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
  "rejected" | "unscreened" | "disputed" | "pending_screening";

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

export interface CapacityMetrics {
  roles: {
    id: string;
    title: string;
    openSlots: number;
    candidatesInPipeline: number;
    candidatesPendingReview: number;
    candidatesApproved: number;
    candidatesRejected: number;
    avgScreeningTimeHours: number;
  }[];
  reviewers: {
    id: string;
    name: string;
    candidatesAssigned: number;
    candidatesCompleted: number;
    avgTimePerCandidateHours: number;
  }[];
  overall: {
    totalCandidates: number;
    pendingScreening: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    avgScore: number;
    disputeCount: number;
  };
}

export interface CsvImportResult {
  imported: number;
  failed: number;
  screened: number;
  screeningFailed: number;
  errors: string[];
}

export interface ReviewOutcome {
  candidate: Candidate;
  scorecardAvg?: number;
  warning?: string;
}

export interface PipelineSummary {
  total: number;
  byStatus: Record<CandidateStatus, number>;
  avgScore: number;
  avgScreeningTimeMs: number;
  scorecardsSubmitted: number;
  outboxPending: number;
}
