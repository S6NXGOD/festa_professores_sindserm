ALTER TYPE "public"."affiliation_document_kind" ADD VALUE 'SIGNED_FORM';--> statement-breakpoint
ALTER TABLE "affiliation_document" ADD COLUMN "preview" "bytea";--> statement-breakpoint
ALTER TABLE "affiliation_document" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "forms_whatsapp" text;--> statement-breakpoint
ALTER TABLE "event_config" ADD CONSTRAINT "event_config_forms_whatsapp_digits" CHECK ("event_config"."forms_whatsapp" IS NULL OR "event_config"."forms_whatsapp" ~ '^[0-9]{10,13}$');