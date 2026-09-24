-- 00122_rfid_and_whatsapp_cron.sql
-- Cron jobs: J-5 (8:00 AM) and J-1 (9:00 AM) subscription reminders + WhatsApp sending (9:30 AM)

-- Unschedule old cron jobs
SELECT cron.unschedule('send-subscription-reminder');
SELECT cron.unschedule('send-payment-reminder');

-- J-5 subscription reminder at 8:00 AM daily
SELECT cron.schedule(
  'send-subscription-reminder',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qgxisgmfnkxwdkchfneb.supabase.co/functions/v1/send-subscription-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
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
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
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
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    )
  ) AS request_id;
  $$
);

-- Fix member_subscriptions CHECK to include pending_payment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'member_subscriptions_status_check'
  ) THEN
    ALTER TABLE member_subscriptions
    ADD CONSTRAINT member_subscriptions_status_check
    CHECK (status IN ('active', 'expired', 'cancelled', 'pending_payment'));
  END IF;
END $$;
