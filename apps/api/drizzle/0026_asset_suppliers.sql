CREATE TABLE "asset_suppliers" (
	"organization_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	CONSTRAINT "asset_suppliers_asset_id_supplier_id_pk" PRIMARY KEY("asset_id","supplier_id")
);
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_supplier_fk";
--> statement-breakpoint
ALTER TABLE "asset_suppliers" ADD CONSTRAINT "asset_suppliers_asset_fk" FOREIGN KEY ("organization_id","asset_id") REFERENCES "public"."assets"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_suppliers" ADD CONSTRAINT "asset_suppliers_supplier_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_suppliers_supplier_idx" ON "asset_suppliers" USING btree ("supplier_id");--> statement-breakpoint
-- Each asset keeps the Supplier it had; more can be linked from now on.
INSERT INTO "asset_suppliers" ("organization_id", "asset_id", "supplier_id")
SELECT "organization_id", "id", "supplier_id" FROM "assets" WHERE "supplier_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "supplier_id";
