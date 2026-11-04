ALTER TABLE "tasks" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "due_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "committed_at" timestamp with time zone;--> statement-breakpoint
-- Every Task so far had its owner and due date from the start.
UPDATE "tasks" SET "committed_at" = "created_at";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_committed_with_owner_and_date" CHECK ("tasks"."committed_at" is null or ("tasks"."owner_id" is not null and "tasks"."due_on" is not null));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_done_once_committed" CHECK ("tasks"."done_at" is null or "tasks"."committed_at" is not null);