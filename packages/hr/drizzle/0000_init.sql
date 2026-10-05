CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text,
	"action" text NOT NULL,
	"detail" jsonb NOT NULL,
	"at" text NOT NULL,
	"tenant_id" text
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"resume_text" text NOT NULL,
	"status" text NOT NULL,
	"screening" jsonb,
	"review" jsonb,
	"ai_notice_disclosed_at" text,
	"dispute" jsonb,
	"enrichment" jsonb,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"tenant_id" text
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"candidate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" text NOT NULL,
	"dispatched_at" text,
	"claimed_until" text,
	"tenant_id" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"requirements" jsonb NOT NULL,
	"nice_to_have" jsonb NOT NULL,
	"created_at" text NOT NULL,
	"tenant_id" text
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"reviewer_name" text NOT NULL,
	"answers" jsonb NOT NULL,
	"overall_score" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"tenant_id" text
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("dispatched_at");--> statement-breakpoint
CREATE INDEX "outbox_candidate_idx" ON "outbox_events" USING btree ("candidate_id");