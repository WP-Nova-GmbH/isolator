-- Checked when the transaction commits. Deleting an Organization cascades to its Members and to
-- the rows that name them, in no fixed order; a lone Member with history is still refused.
ALTER TABLE "risks" ALTER CONSTRAINT "risks_owner_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "risk_history" ALTER CONSTRAINT "risk_history_member_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "risk_assessments" ALTER CONSTRAINT "risk_assessments_completed_by_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_owner_fk" DEFERRABLE INITIALLY DEFERRED;
