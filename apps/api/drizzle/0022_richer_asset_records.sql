CREATE TYPE "public"."asset_status" AS ENUM('planned', 'operational');--> statement-breakpoint
CREATE TYPE "public"."asset_validation" AS ENUM('unvalidated', 'validated');--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "status" "asset_status" DEFAULT 'operational' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "technical_owner_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "validation" "asset_validation" DEFAULT 'unvalidated' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_technical_owner_fk" FOREIGN KEY ("organization_id","technical_owner_id") REFERENCES "public"."members"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- As in 0003: checked at commit, so deleting an Organization can remove these rows in any order.
ALTER TABLE "assets" ALTER CONSTRAINT "assets_technical_owner_fk" DEFERRABLE INITIALLY DEFERRED;