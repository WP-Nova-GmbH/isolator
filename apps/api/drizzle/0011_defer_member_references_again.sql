-- As in 0003: checked at commit, so deleting an Organization can remove these rows in any order.
ALTER TABLE "stored_files" ALTER CONSTRAINT "stored_files_uploaded_by_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "supplier_files" ALTER CONSTRAINT "supplier_files_stored_file_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "assets" ALTER CONSTRAINT "assets_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "incidents" ALTER CONSTRAINT "incidents_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "incidents" ALTER CONSTRAINT "incidents_closed_by_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "incidents" ALTER CONSTRAINT "incidents_risk_fk" DEFERRABLE INITIALLY DEFERRED;
