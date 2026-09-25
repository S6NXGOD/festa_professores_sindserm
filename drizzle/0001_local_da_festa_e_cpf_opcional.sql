CREATE TABLE "event_photo" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_photo_singleton" CHECK ("event_photo"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "person" DROP CONSTRAINT "person_cpf_digits";--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "cpf" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "venue_name" text;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "venue_address" text;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "venue_description" text;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "venue_maps_url" text;--> statement-breakpoint
ALTER TABLE "event_photo" ADD CONSTRAINT "event_photo_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_cpf_digits" CHECK ("person"."cpf" IS NULL OR "person"."cpf" ~ '^[0-9]{11}$');