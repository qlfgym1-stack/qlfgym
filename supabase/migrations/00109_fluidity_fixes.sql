-- ============================================================================
-- Migration 00109: Fluidity fixes
--   1. RPC get_member_attendance_counts : compte serveur (GROUP BY) des
--      séances par membre — remplace le select complet de `attendance` côté
--      client (members.tsx). Garde d'appartenance à l'org + SET search_path.
--   2. Index composites manquants sur les chemins de lecture chauds.
--   3. Fix statut fantôme 'trial' dans phone_check_in : le CHECK de
--      member_subscriptions n'a jamais autorisé 'trial' — filtre inerte retiré.
--   4. SET search_path = public sur les RPCs SECURITY DEFINER sensibles
--      (sécurisé en 00100 : checks de rôle déjà en place).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_member_attendance_counts
--    Réplique exacte de l'ancienne logique JS de members.tsx :
--      - dernière souscription de chaque membre (created_at DESC)
--      - COUNT des présences dont check_in ∈ [start_date, end_date]
--      - RETURN de { member_id, visit_count } pour chaque membre abonné
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_member_attendance_counts(p_org_id UUID)
RETURNS TABLE (member_id UUID, visit_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Garde : le caller doit être membre de l'organisation
  IF NOT is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this organization';
  END IF;

  RETURN QUERY
  WITH latest_sub AS (
    SELECT DISTINCT ON (ms.member_id) ms.member_id, ms.start_date, ms.end_date
    FROM member_subscriptions ms
    WHERE ms.organization_id = p_org_id
    ORDER BY ms.member_id, ms.created_at DESC
  )
  SELECT a.member_id, COUNT(*)::BIGINT AS visit_count
  FROM attendance a
  JOIN latest_sub ls ON ls.member_id = a.member_id
  WHERE a.organization_id = p_org_id
    AND a.check_in IS NOT NULL
    AND a.check_in::date BETWEEN ls.start_date AND ls.end_date
  GROUP BY a.member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_attendance_counts(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Index composites manquants (00102 couvre déjà
--    member_subscriptions(organization_id, status, end_date))
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_org_phone ON members(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_attendance_org_checkin ON attendance(organization_id, check_in);
CREATE INDEX IF NOT EXISTS idx_payments_org_date ON payments(organization_id, payment_date);

-- ---------------------------------------------------------------------------
-- 3. phone_check_in : retrait du statut fantôme 'trial' (le CHECK de
--    member_subscriptions n'autorise que active/expired/cancelled/pending_payment)
--    + SET search_path. Corps identique à la version 00065.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION phone_check_in(p_phone TEXT, p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_member_name TEXT;
  v_has_active_sub BOOLEAN;
  v_existing RECORD;
BEGIN
  -- Garde : le caller doit être membre de l'organisation
  IF NOT is_org_member(p_org_id) THEN
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
    RETURN jsonb_build_object(
      'result', 'denied',
      'reason', 'Aucun membre trouvé avec ce numéro'
    );
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM member_subscriptions ms
    WHERE ms.member_id = v_member_id
      AND ms.organization_id = p_org_id
      AND ms.status = 'active'
      AND (ms.end_date IS NULL OR ms.end_date >= CURRENT_DATE)
  ) INTO v_has_active_sub;

  IF NOT v_has_active_sub THEN
    RETURN jsonb_build_object(
      'result', 'denied',
      'reason', 'Aucun abonnement actif',
      'member_id', v_member_id,
      'member_name', v_member_name
    );
  END IF;

  SELECT id, check_in, check_out
  INTO v_existing
  FROM attendance
  WHERE member_id = v_member_id
    AND organization_id = p_org_id
    AND check_in::date = CURRENT_DATE
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
$$;

-- ---------------------------------------------------------------------------
-- 4. SET search_path = public sur les RPCs SECURITY DEFINER sensibles
--    (checks de rôle appliqués en 00100 — durcissement search_path).
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.assign_rfid_card(UUID, TEXT, TEXT, TEXT, UUID) SET search_path = public;
ALTER FUNCTION public.replace_rfid_card(UUID, TEXT, TEXT, TEXT, TEXT, UUID) SET search_path = public;
ALTER FUNCTION public.deactivate_rfid_card(TEXT, TEXT, TEXT, UUID) SET search_path = public;
ALTER FUNCTION public.reactivate_rfid_card(TEXT, TEXT, TEXT, UUID) SET search_path = public;
ALTER FUNCTION public.check_rfid_available(TEXT) SET search_path = public;
ALTER FUNCTION public.get_member_rfid_history(UUID) SET search_path = public;
ALTER FUNCTION public.get_dashboard_stats(UUID) SET search_path = public;
ALTER FUNCTION public.get_staff_roster(UUID) SET search_path = public;