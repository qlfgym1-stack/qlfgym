-- 00129_fix_rpc_overloads_and_guards.sql
-- Corrections issues de l'audit bugs par modules (sept. 2026) :
--   C1  : create_member_with_pending_subscription avait 2 surcharges aux mêmes
--        noms de params (00119 vs 00126) -> ambiguïté PostgREST (PGRST203) et
--        l'une des deux perdait la remise corporate (0 sub discount_rate>0).
--        => DROP des 2, recréation d'UNE seule fonction complète :
--           garde rôle + garde anti-chevauchement (00126) + remise corporate (00119).
--   H10 : record_pos_checkout décrémente stock sans garde qty>0 => quantité
--        négative gonflerait le stock (les autres RPC stock ont cette garde).
--        + l'ancienne surcharge 8-args (sans p_idempotency_key) reste exposée
--        et court-circuite la protection anti double-soumission de 00126 => DROP.
--   C2  : auto_close_stale_attendances() SECURITY DEFINER sans autorisation ni
--        filtre organization_id, fabriquait check_out = check_in + 1h sur toutes
--        les orgs. => nouvelle signature (p_organization_id) + is_org_member +
--        fermeture à minuit du jour suivant le check_in.
--   C5  : manual_check_in avait une surcharge 3-args orpheline (oit sans garde
--        d'abonnement, utilisée nulle part côté client) => DROP.

-- =============================================================================
-- C1 — create_member_with_pending_subscription : UNE seule fonction
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_member_with_pending_subscription(
  p_organization_id uuid,
  p_first_name text,
  p_last_name text,
  p_subscription_type_id uuid,
  p_start_date date,
  p_email text,
  p_phone text,
  p_gender text,
  p_birth_date date,
  p_address text,
  p_emergency_contact text,
  p_emergency_phone text,
  p_photo_url text,
  p_corporate_id uuid
);

DROP FUNCTION IF EXISTS public.create_member_with_pending_subscription(
  p_organization_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_subscription_type_id uuid,
  p_start_date date,
  p_gender text,
  p_birth_date date,
  p_address text,
  p_emergency_contact text,
  p_emergency_phone text,
  p_photo_url text,
  p_email text,
  p_corporate_id uuid
);

CREATE OR REPLACE FUNCTION public.create_member_with_pending_subscription(
  p_organization_id uuid,
  p_first_name text,
  p_last_name text,
  p_subscription_type_id uuid,
  p_start_date date,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_emergency_contact text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_corporate_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_member_id UUID;
  v_subscription_id UUID;
  v_type subscription_types;
  v_end_date DATE;
  v_discount_rate DECIMAL(5,2) := 0;
BEGIN
  -- Authorization: admin ou réception de l'organisation
  IF EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND role IN ('admin', 'receptionist')
  ) = false THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can create subscriptions';
  END IF;

  -- Remise corporate si une convention active couvre la période
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

  -- Garde anti-doublon : une souscription active ou en attente couvre la période
  -- (le nouveau membre n'en a pas encore, mais protège les ré-invocations/retries)
  IF EXISTS (
    SELECT 1 FROM member_subscriptions
    WHERE member_id = v_member_id
      AND organization_id = p_organization_id
      AND status IN ('active', 'pending_payment')
      AND end_date >= p_start_date
      AND start_date <= v_end_date
  ) THEN
    RAISE EXCEPTION 'An active or pending subscription already exists for this period';
  END IF;

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
$function$;

-- =============================================================================
-- H10 — record_pos_checkout : garde qty>0 + suppression de la surcharge 8-args
-- =============================================================================
DROP FUNCTION IF EXISTS public.record_pos_checkout(
  p_organization_id uuid,
  p_member_id uuid,
  p_items jsonb,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method text,
  p_user_id uuid
);

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
    -- Garde quantité strictement positive (cohérent add_stock/decrement_product_stock)
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour %', COALESCE(v_item->>'name', v_prod_id);
    END IF;
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

-- =============================================================================
-- C2 — auto_close_stale_attendances : sécurisée + scoped par organisation
--      + fermeture à minuit (fin de la journée) au lieu de check_in + 1h
-- =============================================================================
DROP FUNCTION IF EXISTS public.auto_close_stale_attendances();

CREATE OR REPLACE FUNCTION public.auto_close_stale_attendances(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_closed INT;
BEGIN
  -- Seul un membre de l'organisation peut déclencher le nettoyage de SON org
  IF NOT public.is_org_member(p_organization_id) THEN
    RETURN jsonb_build_object(
      'closed', 0,
      'timestamp', NOW(),
      'error', 'Unauthorized: not a member of this organization'
    );
  END IF;

  UPDATE attendance
  SET check_out = date_trunc('day', check_in + INTERVAL '1 day')
  WHERE organization_id = p_organization_id
    AND check_out IS NULL
    AND check_in < CURRENT_DATE
    AND type = 'check-in';

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN jsonb_build_object(
    'closed', v_closed,
    'timestamp', NOW()
  );
END;
$function$;

-- =============================================================================
-- C5 — drop de la surcharge 3-args orpheline de manual_check_in
--      (sans garde d'abonnement ; seule la 5-args est utilisée par le client)
-- =============================================================================
DROP FUNCTION IF EXISTS public.manual_check_in(
  p_member_id uuid,
  p_org_id uuid,
  p_type text
);