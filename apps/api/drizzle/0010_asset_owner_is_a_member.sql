UPDATE "assets" SET "owner_id" = "members"."id"
  FROM "members" JOIN "users" ON "users"."id" = "members"."user_id"
  WHERE "members"."organization_id" = "assets"."organization_id" AND "users"."name" = "assets"."owner";--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "owner";