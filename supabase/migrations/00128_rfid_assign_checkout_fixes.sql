-- 00128_rfid_assign_checkout_fixes.sql
-- Correction de deux bugs RFID détectés à l'audit :
--   A. assign_rfid_card : l'audit 'REPLACE' (auto-désactivation de l'ancienne carte ACTIF)
--      insérait new_rfid_uid = NULL → violation NOT NULL → l'attribution d'une nouvelle carte
--      à un membre possédant déjà une carte ACTIF échouait toujours (rollback complet).
--      Fix : retrouver l'UID de l'ancienne carte et renseigner old_rfid_uid / new_rfid_uid
--      (convention 00127 : les deux valeurs renseignées).
--   B. rfid_check_in (TEXT) : la recherche d'attendance active se fait avec LIMIT 1 sans
--      ORDER BY → si un doublon legacy existait, la ligne choisie était arbitraire.
--      Fix : ORDER BY check_in DESC pour prendre le check-in actif le plus récent.
--   C. rfid_check_out (TEXT) : aucun garde is_org_member (incohérent avec rfid_check_in) →
--      n'importe quel utilisateur authentifié d'une autre organisation pouvait effectuer un
--      check-out sur un UID d'une autre salle. Fix : même garde que le check-in.

-- =============================================================================
-- A. assign_rfid_card
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
  v_old_uid TEXT;
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
  SELECT id, rfid_uid INTO v_old_card_id, v_old_uid
  FROM rfid_cards
  WHERE member_id = p_member_id
    AND status = 'ACTIF'
  ORDER BY created_at DESC LIMIT 1;
  IF v_old_card_id IS NOT NULL THEN
    UPDATE rfid_cards
    SET status = 'DÉSACTIVÉ',
        replaced_at = now(),
        notes = COALESCE(notes, '') || ' | Remplacée le ' || now()::date || ' par ' || p_rfid_uid,
        updated_at = now()
    WHERE id = v_old_card_id;

    INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
    VALUES (p_member_id, v_old_uid, p_rfid_uid, 'REPLACE', 'Ancienne carte désactivée automatiquement', 'Une seule carte ACTIF par membre', p_created_by);
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
-- B. rfid_check_in (TEXT) : ORDER BY sur la recherche d'attendance active
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rfid_check_in(
  p_card_uid text,
  p_terminal text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_member_id UUID;
  v_organization_id UUID;
  v_member_name TEXT;
  v_card_status TEXT;
  v_member_status TEXT;
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

  -- Toggle checkout if already checked in (activité la plus récente d'abord)
  SELECT id INTO v_active_attendance_id
    FROM attendance
    WHERE member_id = v_member_id
      AND check_in IS NOT NULL
      AND check_out IS NULL
      AND type = 'check-in'
    ORDER BY check_in DESC
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
$function$;

-- =============================================================================
-- C. rfid_check_out (TEXT) : garde is_org_member (cohérence avec rfid_check_in)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rfid_check_out(
  p_card_uid text,
  p_terminal text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- Org guard (cohérence avec rfid_check_in)
  IF NOT is_org_member(v_organization_id) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Accès non autorisé');
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
$function$;