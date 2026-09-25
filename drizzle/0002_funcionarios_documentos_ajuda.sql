CREATE TYPE "public"."affiliation_document_kind" AS ENUM('RG', 'PAYSLIP');--> statement-breakpoint
ALTER TYPE "public"."kit_type" ADD VALUE 'EMPLOYEE';--> statement-breakpoint
ALTER TYPE "public"."participant_role" ADD VALUE 'EMPLOYEE';--> statement-breakpoint
ALTER TYPE "public"."stock_pool" ADD VALUE 'EMPLOYEE';--> statement-breakpoint
CREATE TABLE "affiliation_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid,
	"kind" "affiliation_document_kind" NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliation_document_type" CHECK ("affiliation_document"."content_type" IN ('image/jpeg', 'application/pdf'))
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"job_title" text,
	"gets_kit" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "kit_delivery" DROP CONSTRAINT "kit_delivery_guest_kit_not_to_self";--> statement-breakpoint
ALTER TABLE "kit_delivery" ALTER COLUMN "registration_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "check_in" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "help_whatsapp" text;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "affiliation_document" ADD CONSTRAINT "affiliation_document_form_id_affiliation_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."affiliation_form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliation_document" ADD CONSTRAINT "affiliation_document_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliation_document_form_idx" ON "affiliation_document" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "affiliation_document_created_at_idx" ON "affiliation_document" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_person_unique" ON "employee" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "employee_removed_at_idx" ON "employee" USING btree ("removed_at");--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kit_delivery_once_per_employee" ON "kit_delivery" USING btree ("employee_id") WHERE "kit_delivery"."cancelled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_employee_link" CHECK (("check_in"."role"::text = 'EMPLOYEE') = ("check_in"."employee_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "event_config" ADD CONSTRAINT "event_config_help_whatsapp_digits" CHECK ("event_config"."help_whatsapp" IS NULL OR "event_config"."help_whatsapp" ~ '^[0-9]{10,13}$');--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_owner" CHECK (("kit_delivery"."kit_type"::text = 'EMPLOYEE') = ("kit_delivery"."employee_id" IS NOT NULL) AND ("kit_delivery"."kit_type"::text = 'EMPLOYEE') = ("kit_delivery"."registration_id" IS NULL));--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_guest_kit_not_to_self" CHECK ("kit_delivery"."kit_type"::text <> 'GUEST' OR "kit_delivery"."beneficiary_person_id" <> "kit_delivery"."recipient_person_id");