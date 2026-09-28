ALTER TABLE "employee" ADD COLUMN "with_kit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "host_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_host_employee_id_employee_id_fk" FOREIGN KEY ("host_employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_host_idx" ON "employee" USING btree ("host_employee_id");--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_courtesy_only" CHECK ("employee"."category"::text = 'COURTESY' OR ("employee"."with_kit" AND "employee"."host_employee_id" IS NULL));