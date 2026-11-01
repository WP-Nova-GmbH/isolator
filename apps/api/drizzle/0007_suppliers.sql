CREATE TYPE "public"."supplier_criticality" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."supplier_file_kind" AS ENUM('contract', 'data_processing_agreement', 'certificate', 'security_assessment', 'other');--> statement-breakpoint
CREATE TYPE "public"."supplier_review_outcome" AS ENUM('no_concerns', 'concerns', 'stop_using');--> statement-breakpoint
CREATE TABLE "supplier_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"kind" "supplier_file_kind" NOT NULL,
	"title" text NOT NULL,
	"location" text NOT NULL,
	"dated_on" date NOT NULL,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewed_on" date NOT NULL,
	"outcome" "supplier_review_outcome" NOT NULL,
	"notes" text NOT NULL,
	"next_review_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"provides" text DEFAULT '' NOT NULL,
	"owner_id" uuid NOT NULL,
	"criticality" "supplier_criticality" DEFAULT 'medium' NOT NULL,
	"handles_personal_data" boolean DEFAULT false NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"contract_ends" date,
	"exit_plan" text DEFAULT '' NOT NULL,
	"next_review_on" date NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_files" ADD CONSTRAINT "supplier_files_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_reviewer_fk" FOREIGN KEY ("organization_id","reviewer_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_owner_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_files_supplier_idx" ON "supplier_files" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_reviews_supplier_idx" ON "supplier_reviews" USING btree ("supplier_id","reviewed_on");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_org_number_idx" ON "suppliers" USING btree ("organization_id","number");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE cascade ON UPDATE no action;