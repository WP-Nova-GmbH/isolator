CREATE TYPE "public"."member_role" AS ENUM('administrator', 'editor', 'reviewer', 'auditor');--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "role" "member_role" DEFAULT 'editor' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "role" "member_role" DEFAULT 'editor' NOT NULL;--> statement-breakpoint
-- Until now every Member could do everything, so everyone keeps that. So does anyone already
-- invited, which includes the first Member of a new Organization.
UPDATE "members" SET "role" = 'administrator';--> statement-breakpoint
UPDATE "invitations" SET "role" = 'administrator';
