INSERT INTO "soa_entries" ("organization_id", "control_id")
  SELECT DISTINCT "organization_id", "control_id" FROM "tasks" WHERE "control_id" IS NOT NULL
  ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "tasks" SET "soa_entry_id" = "soa_entries"."id" FROM "soa_entries"
  WHERE "soa_entries"."organization_id" = "tasks"."organization_id"
    AND "soa_entries"."control_id" = "tasks"."control_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_control_id_controls_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "control_id";