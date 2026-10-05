export type UserRole = "owner" | "admin" | "operator" | "editor" | "viewer";

export type ContentStatus = "draft" | "published" | "archived";

export type CmsKind =
  | "sharepoint"
  | "sitecore"
  | "aem"
  | "umbraco"
  | "dotnetnuke"
  | "wordpress"
  | "opencms"
  | "custom"
  | "none";

export type AiServiceKind =
  "azure-openai" | "openai" | "gemini" | "copilot" | "anthropic" | "none";

export interface Tenant {
  id: string;
  name: string;
  hosts: string[];
  plan: string;
  preferredCMS: CmsKind;
  preferredAIService: AiServiceKind;
  createdAt: string;
}

export interface Invite {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  detail?: string;
  at: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
}

export interface ContentItem {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  body: string;
  status: ContentStatus;
  publishedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
}

export interface UsageRecord {
  tenantId: string;
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  at: string;
}

export interface PlanLimit {
  seats: number;
  publishedItems: number;
  monthlyAiBudgetUsd: number;
}

export interface PlanInfo extends PlanLimit {
  priceUsd: number;
}

export type PlanName = "starter" | "growth" | "enterprise";

export interface UsageReport {
  tenantId: string;
  period: string;
  totalUsd: number;
  totalRecords: number;
  byTask: Array<{ task: string; count: number; estCostUsd: number }>;
  byModel: Array<{ model: string; count: number; estCostUsd: number }>;
}

export interface Statement {
  tenantId: string;
  period: string;
  plan: PlanName;
  planFeeUsd: number;
  usageCostUsd: number;
  totalUsd: number;
  remainingAiBudgetUsd: number;
  generatedAt: string;
}

export interface WebAppSnapshot {
  tenants: Tenant[];
  users: User[];
  sessions: Session[];
  content: ContentItem[];
  usage: UsageRecord[];
  invites: Invite[];
  auditEvents: AuditEvent[];
}
