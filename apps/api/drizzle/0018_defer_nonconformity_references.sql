-- As in 0003: checked at commit, so deleting an Organization can remove these rows in any order.
ALTER TABLE "nonconformities" ALTER CONSTRAINT "nonconformities_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "nonconformities" ALTER CONSTRAINT "nonconformities_closed_by_fk" DEFERRABLE INITIALLY DEFERRED;
