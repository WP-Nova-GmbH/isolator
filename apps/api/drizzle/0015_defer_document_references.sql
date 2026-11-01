-- As in 0003: checked at commit, so deleting an Organization can remove these rows in any order.
ALTER TABLE "soa_entries" ALTER CONSTRAINT "soa_entries_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "documents" ALTER CONSTRAINT "documents_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER CONSTRAINT "document_versions_file_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER CONSTRAINT "document_versions_created_by_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER CONSTRAINT "document_versions_confirmed_by_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "evidence" ALTER CONSTRAINT "evidence_file_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "evidence" ALTER CONSTRAINT "evidence_document_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "evidence" ALTER CONSTRAINT "evidence_added_by_fk" DEFERRABLE INITIALLY DEFERRED;
