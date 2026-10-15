ALTER TABLE "event_config" ADD COLUMN "kit_plan" jsonb;--> statement-breakpoint
ALTER TABLE "registration" ADD COLUMN "member_kit_waitlisted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registration" ADD COLUMN "guest_kit_waitlisted_at" timestamp with time zone;