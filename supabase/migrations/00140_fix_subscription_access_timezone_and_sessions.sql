-- 00140_fix_subscription_access_timezone_and_sessions.sql
-- Corrige les faux refus « Abonnement inexistant ou expiré » :
--   1) distingue 4 causes réelles : pas encore commencé / terminé / quota épuisé / absent ;
--   2) compare les dates sur la date LOCALE (Africa/Algiers) et non CURRENT_DATE (UTC) ;
--   3) contrôle l'appartenance du membre à l'organisation ;
--   4) ne dépend pas d'une colonne organizations.timezone (inexistante).
-- Helper unique, réutilisé par les fonctions RFID / turnstile / réception.

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
  v_sub_status text;
  v_start date;
  v_end date;
  v_sess_total integer;
  v_sess_used integer;
  v_next_start date;
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

  -- 1) Abonnement actif ET couvrant la date locale du jour (source de vérité)
  SELECT s.id, s.status, s.start_date, s.end_date, s.sessions_total, s.sessions_used
    INTO v_sub_id, v_sub_status, v_start, v_end, v_sess_total, v_sess_used
    FROM member_subscriptions s
   WHERE s.member_id = p_member_id
     AND s.organization_id = p_organization_id
     AND s.status = 'active'
     AND s.start_date <= v_local_date
     AND s.end_date >= v_local_date
   ORDER BY s.end_date DESC, s.created_at DESC
   LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    -- Quota de séances épuisé (les abonnements sans quota ne sont jamais bloqués)
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

  -- 2) Abonnement actif mais pas encore démarré (paiement anticipé)
  SELECT min(s.start_date) INTO v_next_start
    FROM member_subscriptions s
   WHERE s.member_id = p_member_id
     AND s.organization_id = p_organization_id
     AND s.status = 'active'
     AND s.start_date > v_local_date;

  IF v_next_start IS NOT NULL THEN
    RETURN QUERY SELECT false,
      'Abonnement valide à partir du ' || to_char(v_next_start, 'DD/MM/YYYY'),
      NULL::uuid;
    RETURN;
  END IF;

  -- 3) Abonnement actif mais dont la période est déjà passée (statut non rafraîchi)
  SELECT s.id, s.end_date INTO v_sub_id, v_end
    FROM member_subscriptions s
   WHERE s.member_id = p_member_id
     AND s.organization_id = p_organization_id
     AND s.status = 'active'
     AND s.end_date < v_local_date
   ORDER BY s.end_date DESC
   LIMIT 1;

  IF v_sub_id IS NOT NULL THEN
    RETURN QUERY SELECT false,
      'Abonnement arrivé à terme le ' || to_char(v_end, 'DD/MM/YYYY')
      , NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 'Abonnement inexistant ou expiré'::text, NULL::uuid;
END;
$BODY$;