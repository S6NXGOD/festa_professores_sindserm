CREATE TYPE "public"."affiliation_form_origin" AS ENUM('PUBLIC', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."affiliation_form_status" AS ENUM('DRAFT', 'FORMALIZED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."affiliation_status" AS ENUM('PENDING', 'AWAITING_SIGNATURE', 'CONFIRMED', 'REJECTED', 'JOINED_AT_EVENT');--> statement-breakpoint
CREATE TYPE "public"."check_in_method" AS ENUM('QR', 'SEARCH', 'CODE');--> statement-breakpoint
CREATE TYPE "public"."guest_link_status" AS ENUM('ACTIVE', 'REMOVED', 'CONVERTED');--> statement-breakpoint
CREATE TYPE "public"."kit_type" AS ENUM('MEMBER', 'GUEST');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('MEMBER', 'GUEST');--> statement-breakpoint
CREATE TYPE "public"."registration_origin" AS ENUM('PUBLIC_FORM', 'PRE_AFFILIATION', 'STAFF', 'GUEST_CONVERSION', 'NEW_AFFILIATION');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('ADMIN', 'ATTENDANT', 'SECURITY');--> statement-breakpoint
CREATE TYPE "public"."stock_mode" AS ENUM('SINGLE', 'SPLIT');--> statement-breakpoint
CREATE TYPE "public"."stock_pool" AS ENUM('ALL', 'MEMBER', 'GUEST');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliation_form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "affiliation_form_status" DEFAULT 'DRAFT' NOT NULL,
	"origin" "affiliation_form_origin" NOT NULL,
	"is_teacher" boolean NOT NULL,
	"form_date" date NOT NULL,
	"full_name" text NOT NULL,
	"mother_name" text NOT NULL,
	"father_name" text,
	"address" text NOT NULL,
	"address_number" text NOT NULL,
	"neighborhood" text NOT NULL,
	"email" text,
	"whatsapp" text NOT NULL,
	"birth_date" date NOT NULL,
	"rg" text NOT NULL,
	"cpf" text NOT NULL,
	"workplace" text NOT NULL,
	"registration_number" text NOT NULL,
	"job_title" text NOT NULL,
	"admission_date" date NOT NULL,
	"contribution_start_month" text NOT NULL,
	"authorization_accepted" boolean NOT NULL,
	"authorization_text" text NOT NULL,
	"authorization_accepted_at" timestamp with time zone NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"formalized_at" timestamp with time zone,
	"formalized_by_user_id" text,
	"registration_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" text,
	CONSTRAINT "affiliation_form_authorization_accepted" CHECK ("affiliation_form"."authorization_accepted" = true),
	CONSTRAINT "affiliation_form_formalized_consistency" CHECK (("affiliation_form"."status" = 'FORMALIZED') = ("affiliation_form"."formalized_at" IS NOT NULL)),
	CONSTRAINT "affiliation_form_formalized_registration" CHECK ("affiliation_form"."status" <> 'FORMALIZED' OR "affiliation_form"."registration_id" IS NOT NULL),
	CONSTRAINT "affiliation_form_origin_author" CHECK ("affiliation_form"."origin" = 'PUBLIC' OR "affiliation_form"."created_by_user_id" IS NOT NULL),
	CONSTRAINT "affiliation_form_cpf_digits" CHECK ("affiliation_form"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "affiliation_form_contribution_month" CHECK ("affiliation_form"."contribution_start_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "participant_role" NOT NULL,
	"registration_id" uuid,
	"guest_link_id" uuid,
	"voucher_id" uuid,
	"method" "check_in_method" NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_by_user_id" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" text,
	"cancel_reason" text,
	CONSTRAINT "check_in_role_links" CHECK (("check_in"."role" = 'GUEST') = ("check_in"."guest_link_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "event_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"event_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time,
	"registration_opens_at" timestamp with time zone NOT NULL,
	"registration_closes_at" timestamp with time zone NOT NULL,
	"kit_deadline_time" time,
	"stock_mode" "stock_mode" NOT NULL,
	"low_stock_threshold" integer NOT NULL,
	"setup_completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_config_singleton" CHECK ("event_config"."id" = 1),
	CONSTRAINT "event_config_registration_period" CHECK ("event_config"."registration_closes_at" > "event_config"."registration_opens_at"),
	CONSTRAINT "event_config_low_stock_threshold" CHECK ("event_config"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guest_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"guest_person_id" uuid NOT NULL,
	"status" "guest_link_status" DEFAULT 'ACTIVE' NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_user_id" text,
	"end_reason" text,
	"converted_to_registration_id" uuid,
	CONSTRAINT "guest_link_ended_consistency" CHECK (("guest_link"."status" = 'ACTIVE') = ("guest_link"."ended_at" IS NULL)),
	CONSTRAINT "guest_link_conversion_consistency" CHECK (("guest_link"."status" = 'CONVERTED') = ("guest_link"."converted_to_registration_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "kit_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"kit_type" "kit_type" NOT NULL,
	"recipient_person_id" uuid NOT NULL,
	"beneficiary_person_id" uuid NOT NULL,
	"guest_link_id" uuid,
	"stock_pool" "stock_pool" NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_by_user_id" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" text,
	"cancel_reason" text,
	CONSTRAINT "kit_delivery_guest_link" CHECK (("kit_delivery"."kit_type" = 'GUEST') = ("kit_delivery"."guest_link_id" IS NOT NULL)),
	CONSTRAINT "kit_delivery_member_kit_is_own" CHECK ("kit_delivery"."kit_type" = 'GUEST' OR "kit_delivery"."beneficiary_person_id" = "kit_delivery"."recipient_person_id"),
	CONSTRAINT "kit_delivery_guest_kit_not_to_self" CHECK ("kit_delivery"."kit_type" = 'MEMBER' OR "kit_delivery"."beneficiary_person_id" <> "kit_delivery"."recipient_person_id")
);
--> statement-breakpoint
CREATE TABLE "kit_stock" (
	"pool" "stock_pool" PRIMARY KEY NOT NULL,
	"total" integer NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_stock_total_non_negative" CHECK ("kit_stock"."total" >= 0),
	CONSTRAINT "kit_stock_delivered_non_negative" CHECK ("kit_stock"."delivered" >= 0),
	CONSTRAINT "kit_stock_never_negative" CHECK ("kit_stock"."delivered" <= "kit_stock"."total")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"search_name" text NOT NULL,
	"cpf" text NOT NULL,
	"whatsapp" text,
	"registration_number" text,
	"registration_number_key" text GENERATED ALWAYS AS (NULLIF(upper(regexp_replace(registration_number, '[^0-9A-Za-z]', '', 'g')), '')) STORED,
	"workplace" text,
	"is_minor" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_cpf_digits" CHECK ("person"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "person_whatsapp_digits" CHECK ("person"."whatsapp" IS NULL OR "person"."whatsapp" ~ '^[0-9]{10,13}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_person_id" uuid NOT NULL,
	"status" "affiliation_status" DEFAULT 'PENDING' NOT NULL,
	"is_teacher" boolean NOT NULL,
	"origin" "registration_origin" NOT NULL,
	"access_token_hash" text NOT NULL,
	"submission_id" uuid,
	"status_changed_at" timestamp with time zone,
	"status_changed_by_user_id" text,
	"status_note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "staff_role" DEFAULT 'SECURITY' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"code" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_ciphertext" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"revoke_reason" text,
	CONSTRAINT "voucher_code_format" CHECK ("voucher"."code" ~ '^[0-9A-HJKMNP-TV-Z]{8}$')
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliation_form" ADD CONSTRAINT "affiliation_form_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliation_form" ADD CONSTRAINT "affiliation_form_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliation_form" ADD CONSTRAINT "affiliation_form_formalized_by_user_id_user_id_fk" FOREIGN KEY ("formalized_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliation_form" ADD CONSTRAINT "affiliation_form_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliation_form" ADD CONSTRAINT "affiliation_form_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_guest_link_id_guest_link_id_fk" FOREIGN KEY ("guest_link_id") REFERENCES "public"."guest_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_voucher_id_voucher_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."voucher"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_checked_in_by_user_id_user_id_fk" FOREIGN KEY ("checked_in_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_link" ADD CONSTRAINT "guest_link_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_link" ADD CONSTRAINT "guest_link_guest_person_id_person_id_fk" FOREIGN KEY ("guest_person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_link" ADD CONSTRAINT "guest_link_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_link" ADD CONSTRAINT "guest_link_ended_by_user_id_user_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_link" ADD CONSTRAINT "guest_link_converted_to_registration_id_registration_id_fk" FOREIGN KEY ("converted_to_registration_id") REFERENCES "public"."registration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_recipient_person_id_person_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_beneficiary_person_id_person_id_fk" FOREIGN KEY ("beneficiary_person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_guest_link_id_guest_link_id_fk" FOREIGN KEY ("guest_link_id") REFERENCES "public"."guest_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_delivered_by_user_id_user_id_fk" FOREIGN KEY ("delivered_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_member_person_id_person_id_fk" FOREIGN KEY ("member_person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_status_changed_by_user_id_user_id_fk" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher" ADD CONSTRAINT "voucher_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher" ADD CONSTRAINT "voucher_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher" ADD CONSTRAINT "voucher_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliation_form_one_open_per_person" ON "affiliation_form" USING btree ("person_id") WHERE "affiliation_form"."status" IN ('DRAFT', 'FORMALIZED');--> statement-breakpoint
CREATE INDEX "affiliation_form_status_idx" ON "affiliation_form" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_one_active_per_person" ON "check_in" USING btree ("person_id") WHERE "check_in"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "check_in_checked_in_at_idx" ON "check_in" USING btree ("checked_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_link_one_active_per_person" ON "guest_link" USING btree ("guest_person_id") WHERE "guest_link"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "guest_link_one_active_per_registration" ON "guest_link" USING btree ("registration_id") WHERE "guest_link"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "guest_link_registration_idx" ON "guest_link" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "guest_link_guest_person_idx" ON "guest_link" USING btree ("guest_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kit_delivery_once_per_type" ON "kit_delivery" USING btree ("registration_id","kit_type") WHERE "kit_delivery"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "kit_delivery_delivered_at_idx" ON "kit_delivery" USING btree ("delivered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "person_cpf_unique" ON "person" USING btree ("cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "person_registration_number_unique" ON "person" USING btree ("registration_number_key");--> statement-breakpoint
CREATE INDEX "person_search_name_idx" ON "person" USING btree ("search_name");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_member_person_unique" ON "registration" USING btree ("member_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_access_token_unique" ON "registration" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_submission_unique" ON "registration" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "registration_status_idx" ON "registration" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registration_created_at_idx" ON "registration" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_code_unique" ON "voucher" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_token_hash_unique" ON "voucher" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_one_active_per_person" ON "voucher" USING btree ("person_id") WHERE "voucher"."revoked_at" IS NULL;