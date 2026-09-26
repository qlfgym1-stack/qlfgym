-- 00132_fix_pos_stock_org_guard.sql
-- Correction du filtre organisation sur le décrément de stock dans
-- record_pos_checkout. Le client (pos.tsx) n'appelle QUE la surcharge SANS
-- p_session_id (9 args). La migration 00131 avait recréé la surcharge AVEC
-- p_session_id (10 args), laissant la surcharge réellement utilisée (9 args)
-- SANS garde organization_id sur l'UPDATE products (faille inter-org sous
-- SECURITY DEFINER). Ce fichier : drop la 10-args superflue + recrée la
-- 9-args avec le garde organisation.

DROP FUNCTION IF EXISTS public.record_pos_checkout(
  p_organization_id uuid,
  p_session_id uuid,
  p_member_id uuid,
  p_items jsonb,
  p_total numeric,
  p_subtotal numeric,
  p_discount numeric,
  p_payment_method text,
  p_user_id uuid,
  p_idempotency_key text
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

  -- 1. Décrément atomique du stock produits (tout ou rien) — org scoped
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
    WHERE id = v_prod_uuid
      AND organization_id = p_organization_id
      AND stock >= v_qty;
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