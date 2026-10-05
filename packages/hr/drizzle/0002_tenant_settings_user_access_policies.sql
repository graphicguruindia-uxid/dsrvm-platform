ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "settings" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_access" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_access_tenant_email_idx" ON "user_access" ("tenant_id","email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"version" integer NOT NULL,
	"active" boolean NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_tenant_idx" ON "policies" ("tenant_id");
