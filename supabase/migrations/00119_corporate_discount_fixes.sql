-- 00119 : Corporate discount fixes for subscriptions and payments
-- =============================================================================
-- 1. Add discount_rate to member_subscriptions (stores corporate discount %)
-- 2. Add discount column to payments (stores discount amount applied)
-- 3. Update create_member_with_pending_subscription to set discount_rate from corporate
-- 4. Add p_discount parameter to pay_and_renew and finalize_subscription_payment
-- 5. Update finalize_subscription_payment to record discount in payment

-- 1. Add discount_rate to member_subscriptions
ALTER TABLE public.member_subscriptions
ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(5,2) DEFAULT 0 CHECK (discount_rate >= 0 AND discount_rate <= 100);

-- 2. Add discount column to payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) DEFAULT 0 CHECK (discount >= 0);

COMMENT ON COLUMN public.member_subscriptions.discount_rate IS 'Corporate discount percentage applied to this subscription (0-100)';
COMMENT ON COLUMN public.payments.discount IS 'Discount amount applied to this payment';

-- 3. Update create_member_with_pending_subscription to set discount_rate from corporate
CREATE OR REPLACE FUNCTION public.create_member_with_pending_subscription(
  p_organization_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_subscription_type_id UUID,
  p_start_date DATE,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_birth_date DATE DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_emergency_contact TEXT DEFAULT NULL,
  p_emergency_phone TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL,
  p_corporate_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_id UUID;
  v_subscription_id UUID;
  v_type subscription_types;
  v_end_date DATE;
  v_discount_rate DECIMAL(5,2) := 0;
BEGIN
  -- Authorization: admin ou réception de l'organisation
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND role IN ('admin', 'receptionist')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can create subscriptions';
  END IF;

  -- Fetch corporate discount rate if corporate_id provided
  IF p_corporate_id IS NOT NULL THEN
    SELECT COALESCE(discount_rate, 0) INTO v_discount_rate
    FROM corporate
    WHERE id = p_corporate_id
      AND organization_id = p_organization_id
      AND is_active
      AND (contract_start IS NULL OR contract_start <= CURRENT_DATE)
      AND (contract_end IS NULL OR contract_end >= CURRENT_DATE);
  END IF;

  INSERT INTO members (
    organization_id, first_name, last_name, email, phone, gender,
    birth_date, address, emergency_contact, emergency_phone, photo_url,
    status, last_visit, notes, corporate_id
  ) VALUES (
    p_organization_id, p_first_name, p_last_name, p_email, p_phone, p_gender,
    p_birth_date, p_address, p_emergency_contact, p_emergency_phone, p_photo_url,
    'active', NULL, NULL, p_corporate_id
  )
  RETURNING id INTO v_member_id;

  SELECT * INTO v_type
  FROM subscription_types
  WHERE id = p_subscription_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription type not found';
  END IF;

  v_end_date := p_start_date + (v_type.duration_days || ' days')::INTERVAL;

  INSERT INTO member_subscriptions (
    organization_id, member_id, subscription_type_id,
    start_date, end_date, total_amount, amount_paid, status, discount_rate
  ) VALUES (
    p_organization_id, v_member_id, p_subscription_type_id,
    p_start_date, v_end_date, v_type.price, 0, 'pending_payment', v_discount_rate
  )
  RETURNING id INTO v_subscription_id;

  RETURN jsonb_build_object(
    'member_id', v_member_id,
    'subscription_id', v_subscription_id,
    'total_amount', v_type.price,
    'subscription_name', v_type.name,
    'organization_id', p_organization_id,
    'first_name', p_first_name,
    'last_name', p_last_name,
    'discount_rate', v_discount_rate
  );
END;
$$;

-- 4. Update pay_and_renew to accept p_discount and record it in payment
CREATE OR REPLACE FUNCTION public.pay_and_renew(
  p_old_subscription_id UUID,
  p_organization_id UUID,
  p_member_id UUID,
  p_subscription_type_id UUID,
  p_new_start_date DATE,
  p_new_end_date DATE,
  p_total_amount DECIMAL(10,2),
  p_payment_method TEXT,
  p_payment_amount DECIMAL(10,2),
  p_discount DECIMAL(10,2) DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_sub member_subscriptions;
  v_new_subscription_id UUID;
  v_payment_id UUID;
  v_type subscription_types;
  v_discount_rate DECIMAL(5,2);
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

  -- Preserve discount rate from old subscription
  v_discount_rate := COALESCE(v_old_sub.discount_rate, 0);

  UPDATE member_subscriptions
  SET status = 'expired'
  WHERE id = p_old_subscription_id;

  SELECT * INTO v_type
  FROM subscription_types
  WHERE id = p_subscription_type_id;

  INSERT INTO member_subscriptions (
    organization_id, member_id, subscription_type_id,
    start_date, end_date, total_amount, amount_paid, status, discount_rate
  ) VALUES (
    p_organization_id, p_member_id, p_subscription_type_id,
    p_new_start_date, p_new_end_date, p_total_amount, p_payment_amount, 'active', v_discount_rate
  )
  RETURNING id INTO v_new_subscription_id;

  INSERT INTO payments (
    organization_id, member_id, subscription_id, amount,
    payment_date, payment_method, status, discount
  ) VALUES (
    p_organization_id, p_member_id, v_new_subscription_id, p_payment_amount,
    now(), p_payment_method, 'completed', p_discount
  )
  RETURNING id INTO v_payment_id;

  -- Reactivate member if previously inactive
  UPDATE members SET status = 'active'
  WHERE id = p_member_id AND status = 'inactive';

  RETURN jsonb_build_object(
    'success', true,
    'new_subscription_id', v_new_subscription_id,
    'payment_id', v_payment_id,
    'discount_rate', v_discount_rate,
    'discount', p_discount
  );
END;
$$;

-- 5. Update finalize_subscription_payment to accept p_discount and record it
CREATE OR REPLACE FUNCTION public.finalize_subscription_payment(
  p_subscription_id UUID,
  p_organization_id UUID,
  p_member_id UUID,
  p_payment_method TEXT,
  p_amount DECIMAL(10,2),
  p_discount DECIMAL(10,2) DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub member_subscriptions;
  v_payment_id UUID;
  v_discount_rate DECIMAL(5,2);
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

  v_discount_rate := COALESCE(v_sub.discount_rate, 0);

  UPDATE member_subscriptions
  SET status = 'active',
      amount_paid = p_amount
  WHERE id = p_subscription_id;

  INSERT INTO payments (
    organization_id, member_id, subscription_id, amount,
    payment_date, payment_method, status, discount
  ) VALUES (
    p_organization_id, p_member_id, p_subscription_id, p_amount,
    now(), p_payment_method, 'completed', p_discount
  )
  RETURNING id INTO v_payment_id;

  -- Reactivate member if previously inactive
  UPDATE members SET status = 'active'
  WHERE id = p_member_id AND status = 'inactive';

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'payment_id', v_payment_id,
    'discount_rate', v_discount_rate,
    'discount', p_discount
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_member_with_pending_subscription(
  UUID, TEXT, TEXT, UUID, DATE, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.pay_and_renew(
  UUID, UUID, UUID, UUID, DATE, DATE, DECIMAL, TEXT, DECIMAL, DECIMAL
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_subscription_payment(
  UUID, UUID, UUID, TEXT, DECIMAL, DECIMAL
) TO authenticated;