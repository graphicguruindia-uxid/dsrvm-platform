import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type {
  CandidateEnrichment,
  ScreeningResult,
  ReviewDecision,
  DisputeRecord,
} from "../types.js";

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  requirements: jsonb("requirements").$type<string[]>().notNull(),
  niceToHave: jsonb("nice_to_have").$type<string[]>().notNull(),
  createdAt: text("created_at").notNull(),
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
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id"),
  action: text("action").notNull(),
  detail: jsonb("detail").$type<unknown>().notNull(),
  at: text("at").notNull(),
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
  },
  (table) => [
    index("outbox_pending_idx").on(table.dispatchedAt),
    index("outbox_candidate_idx").on(table.candidateId),
  ],
);
