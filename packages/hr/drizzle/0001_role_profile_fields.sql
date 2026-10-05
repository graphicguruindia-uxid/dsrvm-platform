ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "skills" jsonb;
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "experience_min_years" integer;
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "experience_max_years" integer;
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "budget_min" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "budget_max" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "budget_currency" text;
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;