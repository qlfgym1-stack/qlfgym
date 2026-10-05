-- 00142_rfid_access_use_shared_subscription_check.sql
-- Branche le contrôleur unique public.subscription_allows_access() sur les
-- 4 fonctions d'accès physique, pour supprimer les 4 implémentations
-- divergentes qui produisaient :
--   * un message unique trompeur « Abonnement inexistant ou expiré » alors
--     que l'abonnement est actif mais pas encore démarré (3 membres) ;
--   * un refus sur la date UTC (CURRENT_DATE) au lieu de la date locale ;
--   * aucune vérification du quota de séances (1 abonnement) ;
--   * aucun filtre organization_id sur member_subscriptions (faille inter-org) ;
--   * des règles contradictoires entre RFID, téléphone et validation manuelle
--     (téléphone ne vérifiait QUE end_date : un abonnement à démarrage futur
--      était accepté au téléphone mais refusé au tourniquet).

-- ===========================================================================
-- 0. Redéfinit le contrôleur (la version de 00140 référençait
--    organizations.timezone — colonne INEXISTANTE — donc l'appel plantait).
--    Messages distincts selon la cause réelle du refus.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.subscription_allows_access(
  p_member_id uuid,
  p_organization_id uuid
)
RETURNS TABLE(
  allowed boolean,
  reason text,
  subscription_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_local_date date := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_member_status text;
  v_sub_id uuid;
  v_sess_total integer;
  v_sess_used integer;
  v_next_start date;
  v_last_end date;
BEGIN
  IF p_member_id IS NULL OR p_organization_id IS NULL THEN
    RETURN QUERY SELECT false, 'Données invalides'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT m.status INTO v_member_status
    FROM members m
   WHERE m.id = p_member_id
     AND m.organization_id = p_organization_id;

  IF v_member_status IS NULL THEN
    RETURN QUERY SELECT false, 'Membre introuvable dans cette organisation'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_member_status IN ('suspended', 'blocked', 'inactive') THEN
    RETURN QUERY SELECT false, 'Membre ' || v_member_status, NULL::uuid;
    RETURN;
  END IF;

  -- 1) Abonnement actif ET couvrant la date locale du jour
  SELECT s.id, s.sessions_total, s.sessions_used
    INTO v_sub_id, v_sess_total, v_sess_used
    FROM member_subscriptions s
   WHERE s.member_id = p_member_id
     AND s.organization_id = p_organization_id
     AND s.status = 'active'
     AND s.start_date <= v_local_date
     AND s.end_date >= v_local_date
   ORDER BY s.end_date DESC, s.created_at DESC
   LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    IF v_sess_total IS NOT NULL AND v_sess_total > 0 THEN
      v_sess_used := COALESCE(v_sess_used, 0);
      IF v_sess_used >= v_sess_total THEN
        RETURN QUERY SELECT false, 'Plus de séances disponibles'::text, v_sub_id;
        RETURN;
      END IF;
    END IF;
    RETURN QUERY SELECT true, NULL::text, v_sub_id;
    RETURN;
  END IF;

  -- 2) Actif mais pas encore démarré (paiement anticipé)
  SELECT min(s.start_date) INTO v_next_start
    FROM member_subscriptions s
   WHERE s.member_id = p_member_id
     AND s.organization_id = p_organization_id
     AND s.status = 'active'
     AND s.start_date > v_local_date;

  IF v_next_start IS NOT NULL THEN
    RETURN QUERY SELECT false,
      'Abonnement non démarré — valide à partir du ' || to_char(v_next_start, 'DD/MM/YYYY'),
      NULL::uuid;
    RETURN;
  END IF;

  -- 3) Actif mais période terminée (statut non rafraîchi)
  SELECT max(s.end_date) INTO v_last_end
    FROM member_subscriptions s
   WHERE s.member_id = p_member_id
     AND s.organization_id = p_organization_id
     AND s.status = 'active'
     AND s.end_date < v_local_date;

  IF v_last_end IS NOT NULL THEN
    RETURN QUERY SELECT false,
      'Abonnement arrivé à terme le ' || to_char(v_last_end, 'DD/MM/YYYY'),
      NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 'Abonnement inexistant ou expiré'::text, NULL::uuid;
END;
$BODY$;

-- ===========================================================================
-- 1. rfid_check_in(text, text) — tourniquet (chemin du bug signalé)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rfid_check_in(p_card_uid text, p_terminal text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
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
  v_sub record;
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
  IF NOT public.is_org_member(v_organization_id) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Accès non autorisé');
  END IF;

  -- Subscription check (source unique de vérité)
  SELECT * INTO v_sub FROM public.subscription_allows_access(v_member_id, v_organization_id);
  IF NOT coalesce(v_sub.allowed, false) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', v_sub.reason, 'member_id', v_member_id, 'member_name', v_member_name);
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
$BODY$;

-- ===========================================================================
-- 2. rfid_check_in(uuid, uuid, uuid) — même règle, alignement total
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rfid_check_in(
  p_rfid_uid uuid,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_member_id uuid;
  v_member_name text;
  v_sub record;
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

  SELECT * INTO v_sub FROM public.subscription_allows_access(v_member_id, p_organization_id);
  IF NOT coalesce(v_sub.allowed, false) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', v_sub.reason, 'member_id', v_member_id, 'member_name', v_member_name);
  END IF;

  INSERT INTO attendance (organization_id, member_id, check_in, type, source, created_by)
  VALUES (p_organization_id, v_member_id, now(), 'check-in', 'rfid', p_user_id);

  RETURN jsonb_build_object(
    'result', 'granted',
    'member_id', v_member_id,
    'member_name', v_member_name,
    'subscription_id', v_sub.subscription_id
  );
END;
$BODY$;

-- ===========================================================================
-- 3. manual_check_in(...) — validation manuelle par la réception
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.manual_check_in(
  p_member_id uuid,
  p_user_id uuid,
  p_reason text,
  p_terminal text DEFAULT NULL,
  p_reason_detail text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_organization_id UUID;
  v_member_status TEXT;
  v_active_attendance_id UUID;
  v_attendance_id UUID;
  v_sub record;
BEGIN
  IF p_reason NOT IN ('breakdown', 'maintenance', 'emergency', 'test', 'other') THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Motif invalide');
  END IF;

  SELECT organization_id, status INTO v_organization_id, v_member_status
    FROM members WHERE id = p_member_id FOR UPDATE;
  IF v_member_status IN ('suspended', 'blocked', 'inactive') THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Membre ' || v_member_status);
  END IF;

  -- Garde : le caller doit être membre de l'organisation du membre
  IF NOT public.is_org_member(v_organization_id) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Accès non autorisé');
  END IF;

  SELECT * INTO v_sub FROM public.subscription_allows_access(p_member_id, v_organization_id);
  IF NOT coalesce(v_sub.allowed, false) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', v_sub.reason);
  END IF;

  SELECT id INTO v_active_attendance_id
    FROM attendance
    WHERE member_id = p_member_id
      AND check_in IS NOT NULL
      AND check_out IS NULL
      AND type = 'check-in'
    ORDER BY check_in DESC
    LIMIT 1;
  IF v_active_attendance_id IS NOT NULL THEN
    UPDATE attendance SET check_out = NOW() WHERE id = v_active_attendance_id;
  END IF;

  INSERT INTO attendance (organization_id, member_id, check_in, type, source, created_by)
    VALUES (v_organization_id, p_member_id, NOW(), 'check-in', 'manual', auth.uid())
    RETURNING id INTO v_attendance_id;

  INSERT INTO manual_validations (organization_id, member_id, user_id, reason, reason_detail, terminal)
    VALUES (v_organization_id, p_member_id, p_user_id, p_reason, p_reason_detail, p_terminal);

  INSERT INTO rfid_read_logs (card_uid, member_id, terminal, event_type, result, reason, user_id)
    VALUES ('manual', p_member_id, COALESCE(p_terminal, 'kiosk'), 'check-in', 'granted', 'Validation manuelle: ' || p_reason, auth.uid());

  UPDATE members SET last_visit = NOW() WHERE id = p_member_id;

  RETURN jsonb_build_object('result', 'granted', 'attendance_id', v_attendance_id);
END;
$BODY$;

-- ===========================================================================
-- 4. phone_check_in(text, uuid) — aligne sur la même règle (ne vérifiait
--    que end_date, ce qui laissait passer les abonnements non démarrés)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.phone_check_in(p_phone text, p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_member_id UUID;
  v_member_name TEXT;
  v_existing RECORD;
  v_sub record;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Accès non autorisé');
  END IF;

  SELECT m.id, m.first_name || ' ' || m.last_name
  INTO v_member_id, v_member_name
  FROM members m
  WHERE m.organization_id = p_org_id
    AND m.phone IS NOT NULL
    AND REPLACE(REPLACE(REPLACE(REPLACE(m.phone, ' ', ''), '-', ''), '.', ''), '+', '')
      LIKE '%' || REPLACE(REPLACE(REPLACE(REPLACE(p_phone, ' ', ''), '-', ''), '.', ''), '+', '') || '%'
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('result', 'denied', 'reason', 'Aucun membre trouvé avec ce numéro');
  END IF;

  SELECT * INTO v_sub FROM public.subscription_allows_access(v_member_id, p_org_id);
  IF NOT coalesce(v_sub.allowed, false) THEN
    RETURN jsonb_build_object(
      'result', 'denied',
      'reason', v_sub.reason,
      'member_id', v_member_id,
      'member_name', v_member_name
    );
  END IF;

  SELECT id, check_in, check_out
  INTO v_existing
  FROM attendance
  WHERE member_id = v_member_id
    AND organization_id = p_org_id
    AND (check_in AT TIME ZONE 'Africa/Algiers')::date = (now() AT TIME ZONE 'Africa/Algiers')::date
    AND check_out IS NULL
  ORDER BY check_in DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE attendance
      SET check_out = now()
      WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'result', 'granted',
      'action', 'check_out',
      'member_id', v_member_id,
      'member_name', v_member_name
    );
  ELSE
    INSERT INTO attendance (member_id, organization_id, check_in, created_by)
    VALUES (v_member_id, p_org_id, now(), auth.uid());

    RETURN jsonb_build_object(
      'result', 'granted',
      'action', 'check_in',
      'member_id', v_member_id,
      'member_name', v_member_name
    );
  END IF;
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.subscription_allows_access(uuid, uuid) TO authenticated;