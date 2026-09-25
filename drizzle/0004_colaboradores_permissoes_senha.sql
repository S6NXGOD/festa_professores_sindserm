CREATE TYPE "public"."employee_category" AS ENUM('STAFF', 'BOARD', 'CONTRACTOR');--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "category" "employee_category" DEFAULT 'STAFF' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "share_message" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "permissions" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;