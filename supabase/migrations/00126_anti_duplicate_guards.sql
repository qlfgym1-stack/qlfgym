-- 00126_anti_duplicate_guards.sql
-- Gardes anti-doublon suite à l'audit encaissements/RFID :
--   1) create_pending_subscription : refuser si une sub active/pending chevauche déjà
--   2) members.tsx insert direct guarded par contrainte unique partielle
--   3) pay_and_renew : refuser le double-renouvellement (mêmes dates déjà actives)
--   4) assign_rfid_card : refuser si le membre a déjà une carte ACTIF (+ désactiver l'ancienne)
--   5) record_pos_checkout : idempotence par clé (anti double-soumission UI/Enter)

-- =============================================================================
-- 1) Nettoyage préalable : expurger les subs ACTIVES/PENDING en double
--    (même membre + même type + même date de début). On conserve la sub la plus
--    récente valide (end_date max, non cancelled), les autres passent 'expired'.
--    Les paiements 'completed' liés à ces doublons sont annulés logiquement.
-- =============================================================================
DO $$
DECLARE
  v_dup_id uuid;
  v_keep_id uuid;
BEGIN
  FOR v_dup_id, v_keep_id IN
    SELECT ms.id, keep.id
    FROM member_subscriptions ms
    CROSS JOIN LATERAL (
      SELECT ms2.id
      FROM member_subscriptions ms2
      WHERE ms2.member_id = ms.member_id
        AND ms2.subscription_type_id = ms.subscription_type_id
        AND ms2.start_date = ms.start_date
        AND ms2.status IN ('active', 'pending_payment')
        AND ms2.status != 'cancelled'
      ORDER BY ms2.end_date DESC, ms2.created_at ASC
      LIMIT 1
    ) keep
    WHERE ms.status IN ('active', 'pending_payment')
      AND ms.status != 'cancelled'
      AND ms.id <> keep.id
  LOOP
    UPDATE member_subscriptions
    SET status = 'expired',
        amount_paid = 0
    WHERE id = v_dup_id;

    UPDATE payments
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now())
    WHERE subscription_id = v_dup_id
      AND status = 'completed';
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_member_sub_no_duplicate_active
  ON member_subscriptions (member_id, subscription_type_id, start_date)
  WHERE status IN ('active', 'pending_payment');

-- =============================================================================
-- 2) create_pending_subscription : garde anti-chevauchement
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_pending_subscription(
  p_organization_id uuid,
  p_member_id uuid,
  p_subscription_type_id uuid,
  p_start_date date
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_type subscription_types;
  v_end_date DATE;
  v_member RECORD;
  v_subscription_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND role IN ('admin', 'receptionist')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can create subscriptions';
  END IF;

  SELECT id, first_name, last_name INTO v_member
  FROM members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member does not belong to this organization';
  END IF;

  SELECT * INTO v_type
  FROM subscription_types
  WHERE id = p_subscription_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription type not found';
  END IF;

  v_end_date := p_start_date + (v_type.duration_days || ' days')::INTERVAL;

  -- Garde anti-doublon : une souscription active ou en attente couvre déjà la période
  IF EXISTS (
    SELECT 1 FROM member_subscriptions
    WHERE member_id = p_member_id
      AND organization_id = p_organization_id
      AND status IN ('active', 'pending_payment')
      AND end_date >= p_start_date
      AND start_date <= v_end_date
  ) THEN
    RAISE EXCEPTION 'An active or pending subscription already exists for this period';
  END IF;

  INSERT INTO member_subscriptions (
    organization_id, member_id, subscription_type_id,
    start_date, end_date, total_amount, amount_paid, status
  ) VALUES (
    p_organization_id, p_member_id, p_subscription_type_id,
    p_start_date, v_end_date, v_type.price, 0, 'pending_payment'
  )
  RETURNING id INTO v_subscription_id;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'subscription_id', v_subscription_id,
    'total_amount', v_type.price,
    'subscription_name', v_type.name,
    'organization_id', p_organization_id,
    'first_name', v_member.first_name,
    'last_name', v_member.last_name
  );
END;
$function$;

-- =============================================================================
-- 3) create_member_with_pending_subscription : idem (nouveau membre, mais garde
--    sur les doublons potentiels si un membre existant est renvoyé)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_member_with_pending_subscription(
  p_organization_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_subscription_type_id uuid,
  p_start_date date,
  p_gender text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_emergency_contact text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_corporate_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_type subscription_types;
  v_end_date DATE;
  v_member_id UUID;
  v_subscription_id UUID;
  v_member RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND role IN ('admin', 'receptionist')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can create members';
  END IF;

  SELECT * INTO v_type
  FROM subscription_types
  WHERE id = p_subscription_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription type not found';
  END IF;

  v_end_date := p_start_date + (v_type.duration_days || ' days')::INTERVAL;

  INSERT INTO members (
    organization_id, first_name, last_name, phone, gender, birth_date,
    address, emergency_contact, emergency_phone, photo_url, email, corporate_id,
    status
  ) VALUES (
    p_organization_id, p_first_name, p_last_name, p_phone, p_gender, p_birth_date,
    p_address, p_emergency_contact, p_emergency_phone, p_photo_url, p_email, p_corporate_id,
    'active'
  )
  RETURNING id INTO v_member_id;

  INSERT INTO member_subscriptions (
    organization_id, member_id, subscription_type_id,
    start_date, end_date, total_amount, amount_paid, status
  ) VALUES (
    p_organization_id, v_member_id, p_subscription_type_id,
    p_start_date, v_end_date, v_type.price, 0, 'pending_payment'
  )
  RETURNING id INTO v_subscription_id;

  SELECT first_name, last_name INTO v_member
  FROM members WHERE id = v_member_id;

  RETURN jsonb_build_object(
    'member_id', v_member_id,
    'subscription_id', v_subscription_id,
    'total_amount', v_type.price,
    'subscription_name', v_type.name,
    'organization_id', p_organization_id,
    'first_name', v_member.first_name,
    'last_name', v_member.last_name
  );
END;
$function$;

-- =============================================================================
-- 4) pay_and_renew : refuser si le renouvellement est déjà appliqué
--    (une sub active/en attente couvre déjà les nouvelles dates, hors l'ancienne)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.pay_and_renew(
  p_old_subscription_id uuid,
  p_organization_id uuid,
  p_member_id uuid,
  p_subscription_type_id uuid,
  p_new_start_date date,
  p_new_end_date date,
  p_total_amount numeric,
  p_payment_method text,
  p_payment_amount numeric,
  p_discount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
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

  -- Garde anti-doublon : un renouvellement identique a déjà été appliqué
  IF EXISTS (
    SELECT 1 FROM member_subscriptions
    WHERE member_id = p_member_id
      AND organization_id = p_organization_id
      AND id <> p_old_subscription_id
      AND status IN ('active', 'pending_payment')
      AND start_date = p_new_start_date
      AND end_date = p_new_end_date
      AND subscription_type_id = p_subscription_type_id
  ) THEN
    RAISE EXCEPTION 'This renewal has already been applied';
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
$function$;

-- =============================================================================
-- 5) assign_rfid_card : une seule carte ACTIF par membre.
--    Si le membre possède déjà une carte ACTIF, elle est désactivée automatiquement
--    (journalisée) sauf si c'est exactement le même UID (idempotent).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assign_rfid_card(
  p_member_id uuid,
  p_rfid_uid text,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card_id UUID;
  v_existing_status TEXT;
  v_old_card_id UUID;
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM members WHERE id = p_member_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = v_org_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT status INTO v_existing_status FROM rfid_cards WHERE rfid_uid = p_rfid_uid LIMIT 1;
  IF v_existing_status IS NOT NULL AND v_existing_status IN ('ACTIF', 'REMPLACÉ', 'DÉSACTIVÉ', 'PERDU', 'VOLÉ', 'BLACKLISTÉ') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ce badge RFID est déjà attribué à un autre adhérent');
  END IF;

  -- Idempotence : le même UID est déjà la carte ACTIF de ce membre
  SELECT id INTO v_old_card_id
  FROM rfid_cards
  WHERE member_id = p_member_id
    AND rfid_uid = p_rfid_uid
    AND status = 'ACTIF'
  ORDER BY created_at DESC LIMIT 1;
  IF v_old_card_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'card_id', v_old_card_id, 'existing', true);
  END IF;

  -- Désactiver l'ancienne carte ACTIF de ce membre (une seule carte active)
  SELECT id INTO v_old_card_id
  FROM rfid_cards
  WHERE member_id = p_member_id
    AND status = 'ACTIF'
  ORDER BY created_at DESC LIMIT 1;
  IF v_old_card_id IS NOT NULL THEN
    UPDATE rfid_cards
    SET status = 'DÉSACTIVÉ',
        replaced_at = now(),
        replaced_by = v_old_card_id,
        notes = COALESCE(notes, '') || ' | Remplacée le ' || now()::date || ' par ' || p_rfid_uid,
        updated_at = now()
    WHERE id = v_old_card_id;

    INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
    VALUES (p_member_id, p_rfid_uid, NULL, 'REPLACE', 'Ancienne carte désactivée automatiquement', 'Une seule carte ACTIF par membre', p_created_by);
  END IF;

  INSERT INTO rfid_cards (member_id, rfid_uid, status, reason, notes, created_by)
    VALUES (p_member_id, p_rfid_uid, 'ACTIF', p_reason, p_notes, p_created_by)
    RETURNING id INTO v_card_id;

  INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
    VALUES (p_member_id, NULL, p_rfid_uid, 'ASSIGN', p_reason, p_notes, p_created_by);

  RETURN jsonb_build_object('success', true, 'card_id', v_card_id);
END;
$function$;

-- =============================================================================
-- 6) record_pos_checkout : idempotence anti double-soumission.
--    Colonne idempotency_key sur pos_transactions ; si la clé a déjà servi,
--    on retourne la transaction existante sans rien recréer.
-- =============================================================================
ALTER TABLE pos_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_transactions_idempotency
  ON pos_transactions (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_pos_checkout(
  p_organization_id uuid,
  p_member_id uuid,
  p_items jsonb,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method text,
  p_user_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item jsonb;
  v_prod_id text;
  v_prod_uuid uuid;
  v_qty int;
  v_session_id uuid;
  v_tx_id uuid;
  v_existing_id uuid;
BEGIN
  IF NOT public.is_encaissement_operator(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: admin or receptionist only';
  END IF;

  -- Idempotence : déjà encaissé avec cette clé
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM pos_transactions
    WHERE organization_id = p_organization_id
      AND idempotency_key = p_idempotency_key
      AND payment_status = 'completed'
      AND cancelled_at IS NULL
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_existing_id,
        'duplicate', true
      );
    END IF;
  END IF;

  -- 1. Décrément atomique du stock produits (tout ou rien)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := v_item->>'id';
    v_prod_uuid := NULL;
    v_qty := COALESCE((v_item->>'quantity')::int, 1);
    IF v_prod_id IS NULL OR v_prod_id LIKE '\_\_%' THEN
      CONTINUE;
    END IF;
    BEGIN
      v_prod_uuid := v_prod_id::uuid;
    EXCEPTION WHEN others THEN
      v_prod_uuid := NULL;
    END;
    IF v_prod_uuid IS NULL THEN
      CONTINUE;
    END IF;
    UPDATE products
    SET stock = stock - v_qty
    WHERE id = v_prod_uuid AND stock >= v_qty;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock insuffisant pour %', v_item->>'name';
    END IF;
  END LOOP;

  -- 2. Session + transaction
  INSERT INTO pos_sessions (organization_id, status, opened_at, total)
  VALUES (p_organization_id, 'open', now(), p_total)
  RETURNING id INTO v_session_id;

  INSERT INTO pos_transactions (
    session_id, organization_id, member_id, items, subtotal,
    discount, total, payment_method, payment_status, created_by, idempotency_key
  )
  VALUES (
    v_session_id, p_organization_id, p_member_id, p_items, p_subtotal,
    p_discount, p_total, p_payment_method, 'completed', p_user_id, p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  -- 3. Mouvements de stock (même transaction : un échec annule tout)
  PERFORM public.record_pos_sale_stock(v_tx_id);

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'session_id', v_session_id
  );
END;
$function$;