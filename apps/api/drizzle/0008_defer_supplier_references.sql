-- As in 0003: checked at commit, so deleting an Organization can remove these rows in any order.
ALTER TABLE "suppliers" ALTER CONSTRAINT "suppliers_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "supplier_reviews" ALTER CONSTRAINT "supplier_reviews_reviewer_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "assets" ALTER CONSTRAINT "assets_supplier_fk" DEFERRABLE INITIALLY DEFERRED;
