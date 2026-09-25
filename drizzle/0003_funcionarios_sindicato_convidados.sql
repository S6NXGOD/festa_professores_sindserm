ALTER TABLE "kit_delivery" DROP CONSTRAINT "kit_delivery_owner";--> statement-breakpoint
DROP INDEX "kit_delivery_once_per_employee";--> statement-breakpoint
ALTER TABLE "guest_link" ALTER COLUMN "registration_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_link" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "guest_link" ADD CONSTRAINT "guest_link_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_link_one_active_per_employee" ON "guest_link" USING btree ("employee_id") WHERE "guest_link"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "guest_link_employee_idx" ON "guest_link" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kit_delivery_once_per_employee" ON "kit_delivery" USING btree ("employee_id","kit_type") WHERE "kit_delivery"."cancelled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "employee" DROP COLUMN "gets_kit";--> statement-breakpoint
ALTER TABLE "guest_link" ADD CONSTRAINT "guest_link_one_host" CHECK (("guest_link"."registration_id" IS NULL) <> ("guest_link"."employee_id" IS NULL));--> statement-breakpoint
ALTER TABLE "kit_delivery" ADD CONSTRAINT "kit_delivery_owner" CHECK (("kit_delivery"."registration_id" IS NULL) <> ("kit_delivery"."employee_id" IS NULL) AND ("kit_delivery"."kit_type"::text <> 'EMPLOYEE' OR "kit_delivery"."employee_id" IS NOT NULL) AND ("kit_delivery"."kit_type"::text <> 'MEMBER' OR "kit_delivery"."registration_id" IS NOT NULL));