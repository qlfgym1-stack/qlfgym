-- 00143_access_from_payment_not_from_start_date.sql
-- RÈGLE MÉTIER : un abonnement payé et `active` ouvre l'accès IMMÉDIATEMENT,
-- même si start_date est dans le futur. La borne de fin reste end_date.
-- (Choix explicite du gérant : les dates de début saisies sont volontaires et
--  ne doivent pas être modifiées — le membre paie aujourd'hui et doit pouvoir
--  s'entraîner dès aujourd'hui.)
--
-- Conséquences :
--   * TAMI MOHAMMED (09/10→08/11), Chirfi Said (18/10→17/11) et
--     Mhaybiya Mohamed (09/12→08/01) entrent dès leur paiement ;
--   * un abonnement `pending_payment` (non payé) reste refusé ;
--   * l'accès cesse toujours à end_date (jamais de dépassement de période).
--
-- La signature à 3 colonnes est conservée (PostgREST + appelants inchangés).
-- `reason` porte désormais une information même quand allowed = true, afin que
-- l'IHM puisse afficher « période à partir du JJ/MM/AAAA » sans nouveau RPC.

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
  v_sub_start date;
  v_sess_total integer;
  v_sess_used integer;
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

  -- Abonnement payé et actif, encore valable (borne = end_date).
  -- start_date n'est plus un motif de refus : l'accès part du paiement.
  SELECT s.id, s.start_date, s.sessions_total, s.sessions_used
    INTO v_sub_id, v_sub_start, v_sess_total, v_sess_used
    FROM member_subscriptions s
   WHERE s.member_id = p_member_id
     AND s.organization_id = p_organization_id
     AND s.status = 'active'
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

    IF v_sub_start IS NOT NULL AND v_sub_start > v_local_date THEN
      RETURN QUERY SELECT true,
        'Accès ouvert — période valable à partir du ' || to_char(v_sub_start, 'DD/MM/YYYY'),
        v_sub_id;
    ELSE
      RETURN QUERY SELECT true, NULL::text, v_sub_id;
    END IF;
    RETURN;
  END IF;

  -- Abonnement actif dont la période est terminée (statut non rafraîchi)
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