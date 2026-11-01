ALTER TABLE "soa_entries" ADD CONSTRAINT "soa_entries_org_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('scope', 'policy', 'interested_parties', 'roles', 'objectives', 'legal_requirements', 'competence', 'awareness', 'internal_audit', 'management_review');--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"stored_file_id" uuid,
	"created_by_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"owner_id" uuid NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"soa_entry_id" uuid NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"stored_file_id" uuid,
	"document_id" uuid,
	"dated_on" date NOT NULL,
	"expires_on" date,
	"added_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "soa_entries" ALTER COLUMN "control_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "soa_entries" ALTER COLUMN "justification" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "soa_entries" ALTER COLUMN "justification" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "soa_entries" ADD COLUMN "own_number" integer;--> statement-breakpoint
ALTER TABLE "soa_entries" ADD COLUMN "own_title" text;--> statement-breakpoint
ALTER TABLE "soa_entries" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "soa_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_fk" FOREIGN KEY ("organization_id","stored_file_id") REFERENCES "public"."stored_files"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_fk" FOREIGN KEY ("organization_id","created_by_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_confirmed_by_fk" FOREIGN KEY ("organization_id","confirmed_by_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_soa_entry_fk" FOREIGN KEY ("organization_id","soa_entry_id") REFERENCES "public"."soa_entries"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_file_fk" FOREIGN KEY ("organization_id","stored_file_id") REFERENCES "public"."stored_files"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_added_by_fk" FOREIGN KEY ("organization_id","added_by_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_version_idx" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "evidence_soa_entry_idx" ON "evidence" USING btree ("soa_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_stored_file_idx" ON "evidence" USING btree ("stored_file_id");--> statement-breakpoint
ALTER TABLE "soa_entries" ADD CONSTRAINT "soa_entries_owner_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_soa_entry_fk" FOREIGN KEY ("organization_id","soa_entry_id") REFERENCES "public"."soa_entries"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "soa_entries_org_own_idx" ON "soa_entries" USING btree ("organization_id","own_number");--> statement-breakpoint
ALTER TABLE "soa_entries" ADD CONSTRAINT "soa_entries_catalog_or_own" CHECK (("soa_entries"."control_id" is not null) <> ("soa_entries"."own_number" is not null));
