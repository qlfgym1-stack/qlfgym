-- 00130_fix_cron_jobs_vault.sql
-- Fix cron jobs that regressed to current_setting('supabase.service_role_key'):
-- that GUC does not exist on this project (see 00096) -> all 3 EF cron jobs
-- (send-subscription-reminder 8:00, send-whatsapp-notifications 9:30,
--  send-payment-reminder 10:00) failed with "unrecognized configuration parameter".
-- Restore reading the service_role_key from Vault (pattern from 00096).
--
-- Also fixes auto-close-midnight: 00129 replaced auto_close_stale_attendances()
-- (no args) with auto_close_stale_attendances(p_organization_id uuid) which has an
-- is_org_member guard based on auth.uid() (NULL under pg_cron). A dedicated
-- SECURITY DEFINER iteration function owned by postgres is used instead, with
-- EXECUTE revoked from PUBLIC so clients cannot trigger cross-org closure.

-- ---------- 1) Cron-only: close stale attendances for ALL organizations ----------
CREATE OR REPLACE FUNCTION public.auto_close_all_stale_attendances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
  v_org_id UUID;
BEGIN
  FOR v_org_id IN SELECT organization_id FROM public.organizations LOOP
    UPDATE public.attendance
    SET check_out = date_trunc('day', check_in + INTERVAL '1 day')
    WHERE organization_id = v_org_id
      AND check_out IS NULL
      AND check_in < CURRENT_DATE
      AND type = 'check-in';
    v_total := v_total + ROW_COUNT;
  END LOOP;

  RETURN jsonb_build_object(
    'closed', v_total,
    'timestamp', NOW()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_close_all_stale_attendances() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_close_all_stale_attendances() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_close_all_stale_attendances() FROM anon;
GRANT EXECUTE ON FUNCTION public.auto_close_all_stale_attendances() TO postgres;

-- ---------- 2) Reschedule all cron jobs with fixed payloads ----------
SELECT cron.unschedule('send-subscription-reminder');
SELECT cron.unschedule('send-whatsapp-notifications');
SELECT cron.unschedule('send-payment-reminder');
SELECT cron.unschedule('auto-close-midnight');

-- J-5 subscription reminder at 8:00 AM daily
SELECT cron.schedule(
  'send-subscription-reminder',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qgxisgmfnkxwdkchfneb.supabase.co/functions/v1/send-subscription-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    )
  ) AS request_id;
  $$
);

-- WhatsApp notifications sending at 9:30 AM daily
SELECT cron.schedule(
  'send-whatsapp-notifications',
  '30 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qgxisgmfnkxwdkchfneb.supabase.co/functions/v1/send-whatsapp-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    )
  ) AS request_id;
  $$
);

-- Payment reminder at 10:00 AM daily
SELECT cron.schedule(
  'send-payment-reminder',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qgxisgmfnkxwdkchfneb.supabase.co/functions/v1/send-payment-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    )
  ) AS request_id;
  $$
);

-- Auto-close stale attendances daily at 00:01 (iterates all orgs server-side)
SELECT cron.schedule(
  'auto-close-midnight',
  '1 0 * * *',
  $$
  SELECT public.auto_close_all_stale_attendances();
  $$
);