import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ContentStatus, UserRole } from "../types.js";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  hosts: jsonb("hosts").$type<string[]>().notNull(),
  plan: text("plan").notNull(),
  createdAt: text("created_at").notNull(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("users_tenant_idx").on(table.tenantId),
    uniqueIndex("users_tenant_email_idx").on(table.tenantId, table.email),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("sessions_tenant_idx").on(table.tenantId),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<ContentStatus>().notNull(),
    publishedAt: text("published_at"),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("content_tenant_idx").on(table.tenantId),
    uniqueIndex("content_tenant_slug_idx").on(table.tenantId, table.slug),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    task: text("task").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    estCostUsd: doublePrecision("est_cost_usd").notNull(),
    at: text("at").notNull(),
  },
  (table) => [
    index("usage_tenant_idx").on(table.tenantId),
    index("usage_at_idx").on(table.at),
  ],
);
