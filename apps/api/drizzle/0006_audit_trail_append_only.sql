-- The Audit trail can only grow. Deleting an Organization removes its trail with it, and that
-- delete is the only one allowed: it reaches this table through the foreign key, one trigger deep.
CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'The Audit trail is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_events_no_change BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();--> statement-breakpoint
ALTER TABLE "audit_events" ALTER CONSTRAINT "audit_events_member_fk" DEFERRABLE INITIALLY DEFERRED;
