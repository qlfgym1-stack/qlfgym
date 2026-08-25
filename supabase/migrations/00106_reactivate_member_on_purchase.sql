-- Migration 00106: auto-reactivate members on renewal/payment
-- When a member buys a new subscription, automatically set status = 'active'

-- pay_and_renew: add member reactivation
CREATE OR REPLACE FUNCTION pay_and_renew(
  p_old_subscription_id UUID,
  p_organization_id UUID,
  p_member_id UUID,
  p_subscription_type_id UUID,
  p_new_start_date DATE,
  p_new_end_date DATE,
  p_total_amount DECIMAL(10,2),
  p_payment_method TEXT,
  p_payment_amount DECIMAL(10,2)
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_sub member_subscriptions;
  v_new_subscription_id UUID;
  v_payment_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND role IN ('admin', 'receptionist')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can renew subscriptions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM member_subscriptions
    WHERE id = p_old_subscription_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Old subscription does not belong to this organization';
  END IF;

  SELECT * INTO v_old_sub
  FROM member_subscriptions
  WHERE id = p_old_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Old subscription not found';
  END IF;

  IF v_old_sub.status NOT IN ('active', 'expired') THEN
    RAISE EXCEPTION 'Old subscription must be active or expired to renew (current status: %)', v_old_sub.status;
  END IF;

  UPDATE member_subscriptions
  SET status = 'expired'
  WHERE id = p_old_subscription_id;

  INSERT INTO member_subscriptions (
    organization_id, member_id, subscription_type_id,
    start_date, end_date, total_amount, amount_paid, status
  ) VALUES (
    p_organization_id, p_member_id, p_subscription_type_id,
    p_new_start_date, p_new_end_date, p_total_amount, p_payment_amount, 'active'
  )
  RETURNING id INTO v_new_subscription_id;

  INSERT INTO payments (
    organization_id, member_id, subscription_id, amount,
    payment_date, payment_method, status
  ) VALUES (
    p_organization_id, p_member_id, v_new_subscription_id, p_payment_amount,
    now(), p_payment_method, 'completed'
  )
  RETURNING id INTO v_payment_id;

  -- Reactivate member if previously inactive
  UPDATE members SET status = 'active'
  WHERE id = p_member_id AND status = 'inactive';

  RETURN jsonb_build_object(
    'success', true,
    'new_subscription_id', v_new_subscription_id,
    'payment_id', v_payment_id
  );
END;
$$;

-- finalize_subscription_payment: add member reactivation
CREATE OR REPLACE FUNCTION finalize_subscription_payment(
  p_subscription_id UUID,
  p_organization_id UUID,
  p_member_id UUID,
  p_payment_method TEXT,
  p_amount DECIMAL(10,2)
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub member_subscriptions;
  v_payment_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND role IN ('admin', 'receptionist')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can finalize payments';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM member_subscriptions
    WHERE id = p_subscription_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Subscription does not belong to this organization';
  END IF;

  SELECT * INTO v_sub
  FROM member_subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF v_sub.status != 'pending_payment' THEN
    RAISE EXCEPTION 'Subscription is not pending payment';
  END IF;

  UPDATE member_subscriptions
  SET status = 'active',
      amount_paid = p_amount
  WHERE id = p_subscription_id;

  INSERT INTO payments (
    organization_id, member_id, subscription_id, amount,
    payment_date, payment_method, status
  ) VALUES (
    p_organization_id, p_member_id, p_subscription_id, p_amount,
    now(), p_payment_method, 'completed'
  )
  RETURNING id INTO v_payment_id;

  -- Reactivate member if previously inactive
  UPDATE members SET status = 'active'
  WHERE id = p_member_id AND status = 'inactive';

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'payment_id', v_payment_id
  );
END;
$$;
