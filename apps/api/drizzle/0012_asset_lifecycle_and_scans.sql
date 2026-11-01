ALTER TABLE "assets" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "retired_reason" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stored_files" ADD COLUMN "scanned_at" timestamp with time zone;