CREATE TABLE "site_icon" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" "bytea" NOT NULL,
	"version" text NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_icon_singleton" CHECK ("site_icon"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "site_icon" ADD CONSTRAINT "site_icon_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;