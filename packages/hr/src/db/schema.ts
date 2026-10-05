import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  CandidateEnrichment,
  PolicyCategory,
  ScreeningResult,
  ReviewDecision,
  DisputeRecord,
  TenantSettings,
  UserRole,
} from "../types.js";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  settings: jsonb("settings").$type<TenantSettings>(),
});

export const userAccess = pgTable(
  "user_access",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    email: text("email").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("user_access_tenant_email_idx").on(table.tenantId, table.email),
  ],
);

export const policies = pgTable(
  "policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    title: text("title").notNull(),
    category: text("category").$type<PolicyCategory>().notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("policies_tenant_idx").on(table.tenantId)],
);

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  requirements: jsonb("requirements").$type<string[]>().notNull(),
  niceToHave: jsonb("nice_to_have").$type<string[]>().notNull(),
  createdAt: text("created_at").notNull(),
  tenantId: text("tenant_id"),
  skills: jsonb("skills").$type<string[]>(),
  experienceMinYears: integer("experience_min_years"),
  experienceMaxYears: integer("experience_max_years"),
  budgetMin: numeric("budget_min", { precision: 14, scale: 2 }),
  budgetMax: numeric("budget_max", { precision: 14, scale: 2 }),
  budgetCurrency: text("budget_currency"),
  updatedAt: timestamp("updated_at", { mode: "string" }),
});

export const candidates = pgTable("candidates", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  resumeText: text("resume_text").notNull(),
  status: text("status").notNull(),
  screening: jsonb("screening").$type<ScreeningResult | null>(),
  review: jsonb("review").$type<ReviewDecision | null>(),
  aiNoticeDisclosedAt: text("ai_notice_disclosed_at"),
  dispute: jsonb("dispute").$type<DisputeRecord | null>(),
  enrichment: jsonb("enrichment").$type<CandidateEnrichment | null>(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  tenantId: text("tenant_id"),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id"),
  action: text("action").notNull(),
  detail: jsonb("detail").$type<unknown>().notNull(),
  at: text("at").notNull(),
  tenantId: text("tenant_id"),
});

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    candidateId: text("candidate_id").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    at: text("at").notNull(),
    dispatchedAt: text("dispatched_at"),
    claimedUntil: text("claimed_until"),
    tenantId: text("tenant_id"),
  },
  (table) => [
    index("outbox_pending_idx").on(table.dispatchedAt),
    index("outbox_candidate_idx").on(table.candidateId),
  ],
);

export const scorecards = pgTable("scorecards", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  reviewerId: text("reviewer_id").notNull(),
  reviewerName: text("reviewer_name").notNull(),
  answers: jsonb("answers")
    .$type<{ questionId: string; score: number; comment?: string }[]>()
    .notNull(),
  overallScore: text("overall_score").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  tenantId: text("tenant_id"),
});

export type ScorecardRow = typeof scorecards.$inferSelect & {
  tenantId: string | null;
};
