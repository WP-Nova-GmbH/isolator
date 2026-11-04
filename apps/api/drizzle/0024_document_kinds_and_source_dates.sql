ALTER TYPE "public"."document_kind" ADD VALUE 'procedure';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'risk_methodology';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'assessment';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'inventory';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'reference';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'other';--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "dated_on" date;