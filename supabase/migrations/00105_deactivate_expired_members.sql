-- Migration 00105: RPC deactivate_expired_members + pg_cron daily at midnight
-- Automatically sets members.status = 'inactive' when they have no active subscription

CREATE OR REPLACE FUNCTION deactivate_expired_members()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE members
  SET status = 'inactive'
  WHERE status = 'active'
    AND id NOT IN (
      SELECT DISTINCT ms.member_id
      FROM member_subscriptions ms
      WHERE ms.status = 'active'
        AND ms.end_date >= CURRENT_DATE
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- pg_cron: daily at midnight
SELECT cron.schedule(
  'deactivate-expired-members',
  '0 0 * * *',
  'SELECT deactivate_expired_members()'
);
