ALTER TYPE "public"."staff_role" ADD VALUE 'KIT_DESK';--> statement-breakpoint
ALTER TYPE "public"."stock_pool" ADD VALUE 'EXTRA';--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "kits_at_desk" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "registration" ADD COLUMN "member_kit_extra_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registration" ADD COLUMN "guest_kit_extra_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "desk_training_done_at" timestamp with time zone;