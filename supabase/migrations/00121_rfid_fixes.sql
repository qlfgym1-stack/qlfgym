-- 00121_rfid_fixes.sql
-- Fix RFID check-in : sync members.status, search_path, member info, staff fallback

-- 1. Trigger : sync members.status quand un abonnement actif est créé/validé
CREATE OR REPLACE FUNCTION public.sync_member_status_from_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Quand un abonnement devient 'active', réactiver le membre
  IF NEW.status = 'active' THEN
    UPDATE members SET status = 'active' WHERE id = NEW.member_id AND status != 'active';
  END IF;

  -- Quand un abonnement est terminé/cancelled, vérifier s'il en reste d'autres actifs
  IF NEW.status IN ('expired', 'cancelled') THEN
    IF NOT EXISTS (
      SELECT 1 FROM member_subscriptions
      WHERE member_id = NEW.member_id AND status = 'active'
    ) THEN
      UPDATE members SET status = 'inactive' WHERE id = NEW.member_id AND status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_member_status ON member_subscriptions;
CREATE TRIGGER trg_sync_member_status
  AFTER UPDATE OF status ON member_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_member_status_from_subscription();

-- Aussi sur INSERT (nouvel abonnement actif)
DROP TRIGGER IF EXISTS trg_sync_member_status_insert ON member_subscriptions;
CREATE TRIGGER trg_sync_member_status_insert
  AFTER INSERT ON member_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION sync_member_status_from_subscription();

-- 2. Fix rfid_check_in TEXT overload : ajouter search_path + member info dans les dénis
CREATE OR REPLACE FUNCTION public.rfid_check_in(
  p_card_uid TEXT,
  p_terminal TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_organization_id UUID;
  v_member_name TEXT;
  v_card_status TEXT;
  v_member_status TEXT;
  v_card_expires TIMESTAMPTZ;
  v_last_read TIMESTAMPTZ;
  v_active_attendance_id UUID;
  v_turnstile_status TEXT;
  v_attendance_id UUID;
BEGIN
  -- Debounce
  SELECT MAX(read_at) INTO v_last_read
    FROM rfid_read_logs
    WHERE card_uid = p_card_uid
      AND result = 'granted'
      AND read_at > NOW() - INTERVAL '3 seconds';
  IF v_last_read IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Debounce: carte déjà scannée il y a moins de 3 secondes');
  END IF;

  -- Card lookup
  SELECT rc.member_id, rc.status INTO v_member_id, v_card_status
    FROM rfid_cards rc
    WHERE rc.rfid_uid = p_card_uid
    FOR UPDATE;
  IF v_card_status IS NULL THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Carte non trouvée');
  END IF;
  IF v_card_status != 'ACTIF' THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Badge invalide');
  END IF;

  -- Member lookup
  SELECT m.organization_id, m.status, m.first_name || ' ' || m.last_name
    INTO v_organization_id, v_member_status, v_member_name
    FROM members m
    WHERE m.id = v_member_id
    FOR UPDATE;
  IF v_member_status IN ('suspended', 'blocked', 'inactive') THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Membre ' || v_member_status, 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;

  -- Org guard
  IF NOT is_org_member(v_organization_id) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Accès non autorisé');
  END IF;

  -- Subscription check
  IF NOT EXISTS (
    SELECT 1 FROM member_subscriptions
    WHERE member_id = v_member_id
      AND status = 'active'
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
  ) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Abonnement inexistant ou expiré', 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;

  -- Toggle checkout if already checked in
  SELECT id INTO v_active_attendance_id
    FROM attendance
    WHERE member_id = v_member_id
      AND check_in IS NOT NULL
      AND check_out IS NULL
      AND type = 'check-in'
    LIMIT 1;
  IF v_active_attendance_id IS NOT NULL THEN
    UPDATE attendance SET check_out = NOW() WHERE id = v_active_attendance_id;
    INSERT INTO rfid_read_logs (card_uid, member_id, terminal, event_type, result, user_id)
      VALUES (p_card_uid, v_member_id, p_terminal, 'check-out', 'granted', auth.uid());
    RETURN jsonb_build_object('result', 'granted', 'action', 'check_out', 'attendance_id', v_active_attendance_id, 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;

  -- Turnstile check + INSERT attendance
  SELECT status INTO v_turnstile_status
    FROM turnstile_status
    WHERE organization_id = v_organization_id AND terminal = p_terminal;
  IF v_turnstile_status IS NULL OR v_turnstile_status = 'online' THEN
    INSERT INTO attendance (organization_id, member_id, check_in, type, source, created_by)
      VALUES (v_organization_id, v_member_id, NOW(), 'check-in', 'rfid', auth.uid())
      RETURNING id INTO v_attendance_id;
    UPDATE members SET last_visit = NOW() WHERE id = v_member_id;
    INSERT INTO rfid_read_logs (card_uid, member_id, terminal, event_type, result, user_id)
      VALUES (p_card_uid, v_member_id, p_terminal, 'check-in', 'granted', auth.uid());
    RETURN jsonb_build_object('result', 'granted', 'attendance_id', v_attendance_id, 'member_id', v_member_id, 'member_name', v_member_name);
  ELSE
    INSERT INTO rfid_read_logs (card_uid, member_id, terminal, event_type, result, reason, user_id)
      VALUES (p_card_uid, v_member_id, p_terminal, 'check-in', 'pending', 'Turnstile ' || v_turnstile_status, auth.uid());
    RETURN jsonb_build_object('result', 'pending', 'reason', 'Tourniquet ' || v_turnstile_status, 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;
END;
$$;

-- 3. Fix rfid_check_out TEXT overload : ajouter search_path
CREATE OR REPLACE FUNCTION public.rfid_check_out(
  p_card_uid TEXT,
  p_terminal TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_organization_id UUID;
  v_member_name TEXT;
  v_card_status TEXT;
  v_attendance_id UUID;
  v_last_read TIMESTAMPTZ;
BEGIN
  -- Debounce
  SELECT MAX(read_at) INTO v_last_read
    FROM rfid_read_logs
    WHERE card_uid = p_card_uid
      AND result = 'granted'
      AND read_at > NOW() - INTERVAL '3 seconds';
  IF v_last_read IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Debounce: carte déjà scannée il y a moins de 3 secondes');
  END IF;

  -- Card lookup
  SELECT rc.member_id, rc.status INTO v_member_id, v_card_status
    FROM rfid_cards rc
    WHERE rc.rfid_uid = p_card_uid;
  IF v_card_status IS NULL OR v_card_status != 'ACTIF' THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Carte non trouvée');
  END IF;

  -- Member lookup
  SELECT m.organization_id, m.first_name || ' ' || m.last_name
    INTO v_organization_id, v_member_name
    FROM members m
    WHERE m.id = v_member_id;
  IF v_organization_id IS NULL THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Membre introuvable');
  END IF;

  -- Find active attendance
  SELECT id INTO v_attendance_id
    FROM attendance
    WHERE member_id = v_member_id
      AND check_in IS NOT NULL
      AND check_out IS NULL
      AND type = 'check-in'
    ORDER BY check_in DESC
    LIMIT 1;
  IF v_attendance_id IS NULL THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Aucun check-in actif', 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;

  -- Checkout
  UPDATE attendance SET check_out = NOW() WHERE id = v_attendance_id;
  INSERT INTO rfid_read_logs (card_uid, member_id, terminal, event_type, result, user_id)
    VALUES (p_card_uid, v_member_id, p_terminal, 'check-out', 'granted', auth.uid());
  RETURN jsonb_build_object('result', 'granted', 'action', 'check_out', 'attendance_id', v_attendance_id, 'member_id', v_member_id, 'member_name', v_member_name);
END;
$$;

-- 4. Fix overload UUID (migration 00120) : 'active' -> 'ACTIF', format result
CREATE OR REPLACE FUNCTION public.rfid_check_in(
  p_rfid_uid uuid,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_member_name text;
  v_subscription_end_date date;
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Accès non autorisé');
  END IF;

  SELECT m.id, m.first_name || ' ' || m.last_name
  INTO v_member_id, v_member_name
  FROM members m
  JOIN rfid_cards r ON r.member_id = m.id
  WHERE r.rfid_uid = p_rfid_uid
    AND m.organization_id = p_organization_id
    AND r.status = 'ACTIF';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Carte RFID introuvable ou inactive');
  END IF;

  SELECT ms.end_date INTO v_subscription_end_date
  FROM member_subscriptions ms
  WHERE ms.member_id = v_member_id
    AND ms.organization_id = p_organization_id
    AND ms.status = 'active'
    AND ms.end_date >= CURRENT_DATE
  ORDER BY ms.end_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Aucun abonnement actif', 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;

  INSERT INTO attendance (organization_id, member_id, check_in, type, source, created_by)
  VALUES (p_organization_id, v_member_id, now(), 'check-in', 'rfid', p_user_id);

  RETURN jsonb_build_object(
    'result', 'granted',
    'member_id', v_member_id,
    'member_name', v_member_name,
    'subscription_end', v_subscription_end_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rfid_check_out(
  p_rfid_uid uuid,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_member_name text;
  v_attendance_id uuid;
BEGIN
  SELECT m.id, m.first_name || ' ' || m.last_name
  INTO v_member_id, v_member_name
  FROM members m
  JOIN rfid_cards r ON r.member_id = m.id
  WHERE r.rfid_uid = p_rfid_uid
    AND m.organization_id = p_organization_id
    AND r.status = 'ACTIF';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Carte RFID introuvable');
  END IF;

  SELECT id INTO v_attendance_id
    FROM attendance
    WHERE member_id = v_member_id
      AND check_in IS NOT NULL AND check_out IS NULL
      AND type = 'check-in'
    ORDER BY check_in DESC LIMIT 1;

  IF v_attendance_id IS NULL THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Aucun check-in actif', 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;

  UPDATE attendance SET check_out = now() WHERE id = v_attendance_id;
  RETURN jsonb_build_object('result', 'granted', 'action', 'check_out', 'member_id', v_member_id, 'member_name', v_member_name, 'attendance_id', v_attendance_id);
END;
$$;

-- 5. Data fix : réactiver les membres qui ont un abonnement actif mais status 'inactive'
UPDATE members m SET status = 'active'
WHERE m.status = 'inactive'
  AND EXISTS (
    SELECT 1 FROM member_subscriptions ms
    WHERE ms.member_id = m.id
      AND ms.status = 'active'
      AND ms.start_date <= CURRENT_DATE
      AND ms.end_date >= CURRENT_DATE
  );
