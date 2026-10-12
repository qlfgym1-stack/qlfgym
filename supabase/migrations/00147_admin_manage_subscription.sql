-- 00147_admin_manage_subscription.sql
-- RPC admin/Réception : attribuer OU modifier un abonnement d'un membre,
-- avec type (plan) + dates définies manuellement, sans créer de paiement
-- et sans modifier les montants déjà enregistrés.
-- =============================================================================
-- Consignes utilisateur (10/10/2026) :
--   • une date de début FUTURE ne doit pas bloquer l'accès : l'abonnement est
--     ACTIF immédiatement (cohérent avec 00143 « accès dès le paiement »),
--     y compris si le membre a déjà un autre abonnement en cours ;
--   • la modification concerne le type + les dates ;
--   • autorisé pour admin ET réceptionniste (même règle que 00114).
-- =============================================================================
-- Points d'honneur :
--   • AUCUN paiement créé (pas d'INSERT dans payments) ;
--   • AUCUN montant modifié sur une souscription existante
--     (total_amount / amount_paid / discount_rate / sessions_* intacts) ;
--   • statut recalculé à partir de la seule date de fin : EXPIRED si
--     end_date < date locale, ACTIVE sinon (cohérent 00114 + 00143) ;
--   • pour une souscription existante : seuls active/expired sont recalculés,
--     pending_payment / cancelled sont préservés (flux POS intact) ;
--   • réactivation du membre si statut = active (même règle que 00114 / 00121) ;
--   • le membre et le type doivent appartenir à l'organisation.

-- 0. Helper déjà fourni par 00114 : public.is_admin_or_receptionist(uuid)

-- 1. RPC d'attribution / modification d'abonnement
CREATE OR REPLACE FUNCTION public.admin_manage_subscription(
  p_organization_id UUID,
  p_member_id UUID,
  p_subscription_type_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_subscription_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_member RECORD;
  v_sub member_subscriptions;
  v_status TEXT;
  v_type_price NUMERIC;
  v_local_today DATE := (now() AT TIME ZONE 'Africa/Algiers')::date;
  v_new_id UUID;
  v_mode TEXT;
BEGIN
  -- Autorisation serveur : admin ou réceptionniste uniquement
  IF NOT is_admin_or_receptionist(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can manage subscriptions';
  END IF;

  -- Le membre doit appartenir à l'organisation
  SELECT id, status INTO v_member
  FROM members
  WHERE id = p_member_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member does not belong to this organization';
  END IF;

  -- Le type doit appartenir à l'organisation
  SELECT price INTO v_type_price
  FROM subscription_types
  WHERE id = p_subscription_type_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription type does not belong to this organization';
  END IF;

  -- Validation des dates
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Les dates de début et de fin sont obligatoires';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'La date de début ne peut pas être postérieure à la date de fin';
  END IF;

  -- Statut : ACTIF si la fin n'est pas dépassée (même si le début est futur),
  -- EXPIRED sinon — cohérent avec 00114 et 00143
  IF p_end_date < v_local_today THEN
    v_status := 'expired';
  ELSE
    v_status := 'active';
  END IF;

  IF p_subscription_id IS NULL THEN
    -- ── ATTRIBUTION ────────────────────────────────────────────────
    -- Nouvelle souscription, prix du plan, 0 payé, aucun paiement créé.
    INSERT INTO member_subscriptions (
      organization_id, member_id, subscription_type_id,
      start_date, end_date, total_amount, amount_paid, status
    )
    VALUES (
      p_organization_id, p_member_id, p_subscription_type_id,
      p_start_date, p_end_date, v_type_price, 0, v_status
    )
    RETURNING id INTO v_new_id;
    v_mode := 'assign';

    -- Réactivation immédiate du membre (abonnement actif)
    IF v_status = 'active' THEN
      UPDATE members SET status = 'active'
      WHERE id = p_member_id AND status = 'inactive';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'mode', v_mode,
      'subscription_id', v_new_id,
      'status', v_status,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'total_amount', v_type_price,
      'amount_paid', 0
    );
  END IF;

  -- ── MODIFICATION ──────────────────────────────────────────────────
  -- L'abonnement doit appartenir à l'organisation (verrouillage anti-course)
  SELECT * INTO v_sub
  FROM member_subscriptions
  WHERE id = p_subscription_id
    AND organization_id = p_organization_id
    AND member_id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription does not belong to this member in this organization';
  END IF;

  -- Seuls active/expired sont recalculés ; pending_payment / cancelled préservés
  IF v_sub.status IN ('active', 'expired') THEN
    IF p_end_date < v_local_today THEN
      v_status := 'expired';
    ELSE
      v_status := 'active';
    END IF;
  ELSE
    v_status := v_sub.status;
  END IF;

  UPDATE member_subscriptions
  SET subscription_type_id = p_subscription_type_id,
      start_date = p_start_date,
      end_date = p_end_date,
      status = v_status
  WHERE id = p_subscription_id;
  v_mode := 'update';

  -- Réactivation du membre si l'abonnement redevient actif
  IF v_status = 'active' THEN
    UPDATE members SET status = 'active'
    WHERE id = p_member_id AND status = 'inactive';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'mode', v_mode,
    'subscription_id', p_subscription_id,
    'status', v_status,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

-- 2. Exécution : authentifié (PostgREST client) + service_role
GRANT EXECUTE ON FUNCTION public.admin_manage_subscription(uuid, uuid, uuid, date, date, uuid) TO authenticated, service_role;