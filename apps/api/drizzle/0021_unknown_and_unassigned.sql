CREATE TYPE "public"."contract_term" AS ENUM('fixed', 'rolling');--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "classification" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "classification" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "dated_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_files" ALTER COLUMN "dated_on" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "criticality" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "criticality" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "handles_personal_data" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "handles_personal_data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "contract_term" "contract_term";--> statement-breakpoint
-- A missing end date used to read as a rolling contract, though it was as often simply not known.
-- Only an end date says something for sure, so the rest start out as unknown.
UPDATE "suppliers" SET "contract_term" = 'fixed' WHERE "contract_ends" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contract_ends_when_fixed" CHECK (("suppliers"."contract_ends" is not null) = ("suppliers"."contract_term" is not distinct from 'fixed'));