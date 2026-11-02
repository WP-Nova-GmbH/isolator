CREATE TABLE "nonconformities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"found_in" text NOT NULL,
	"found_on" date NOT NULL,
	"cause" text DEFAULT '' NOT NULL,
	"owner_id" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_id" uuid,
	"closed_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nonconformities_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "nonconformity_id" uuid;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_owner_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_closed_by_fk" FOREIGN KEY ("organization_id","closed_by_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nonconformities_org_number_idx" ON "nonconformities" USING btree ("organization_id","number");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_nonconformity_fk" FOREIGN KEY ("organization_id","nonconformity_id") REFERENCES "public"."nonconformities"("organization_id","id") ON DELETE cascade ON UPDATE no action;