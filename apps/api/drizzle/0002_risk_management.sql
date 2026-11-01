ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
CREATE TYPE "public"."risk_history_kind" AS ENUM('draft', 'confirmation');--> statement-breakpoint
CREATE TYPE "public"."risk_treatment" AS ENUM('mitigate', 'accept', 'transfer', 'avoid');--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"started_on" date NOT NULL,
	"completed_on" date,
	"completed_by_id" uuid,
	"acceptance_threshold" integer,
	"register" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_assets" (
	"organization_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "risk_assets_risk_id_asset_id_pk" PRIMARY KEY("risk_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "risk_controls" (
	"organization_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	CONSTRAINT "risk_controls_risk_id_control_id_pk" PRIMARY KEY("risk_id","control_id")
);
--> statement-breakpoint
CREATE TABLE "risk_criteria" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"acceptance_threshold" integer NOT NULL,
	"likelihood_levels" text[] NOT NULL,
	"impact_levels" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" "risk_history_kind" NOT NULL,
	"value" jsonb NOT NULL,
	"replaced_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" uuid NOT NULL,
	"likelihood" integer NOT NULL,
	"impact" integer NOT NULL,
	"residual_likelihood" integer,
	"residual_impact" integer,
	"treatment" "risk_treatment",
	"review_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risks_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "risks_likelihood_range" CHECK ("risks"."likelihood" between 1 and 5),
	CONSTRAINT "risks_impact_range" CHECK ("risks"."impact" between 1 and 5),
	CONSTRAINT "risks_residual_range" CHECK (("risks"."residual_likelihood" is null and "risks"."residual_impact" is null) or ("risks"."residual_likelihood" between 1 and 5 and "risks"."residual_impact" between 1 and 5))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"done_at" timestamp with time zone,
	"risk_id" uuid,
	"control_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_completed_by_fk" FOREIGN KEY ("organization_id","completed_by_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assets" ADD CONSTRAINT "risk_assets_risk_fk" FOREIGN KEY ("organization_id","risk_id") REFERENCES "public"."risks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assets" ADD CONSTRAINT "risk_assets_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_risk_fk" FOREIGN KEY ("organization_id","risk_id") REFERENCES "public"."risks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_criteria" ADD CONSTRAINT "risk_criteria_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_history" ADD CONSTRAINT "risk_history_risk_fk" FOREIGN KEY ("organization_id","risk_id") REFERENCES "public"."risks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_history" ADD CONSTRAINT "risk_history_member_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_risk_fk" FOREIGN KEY ("organization_id","risk_id") REFERENCES "public"."risks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_idx" ON "members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_assessments_one_open_idx" ON "risk_assessments" USING btree ("organization_id") WHERE "risk_assessments"."completed_on" is null;--> statement-breakpoint
CREATE INDEX "risk_history_risk_idx" ON "risk_history" USING btree ("risk_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "risks_org_number_idx" ON "risks" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "tasks_org_due_idx" ON "tasks" USING btree ("organization_id","due_on");
