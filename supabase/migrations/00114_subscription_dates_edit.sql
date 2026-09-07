-- 00114: Modifier la date d'abonnement d'un membre (rôles admin + receptionist)
-- =============================================================================
-- RPC public.update_subscription_dates :
--   - accès réservé à admin / receptionist de l'organisation
--   - valide que l'abonnement appartient bien à l'organisation
--   - valide les dates (obligatoires, début <= fin)
--   - recalcule le statut à partir de la nouvelle date de fin
--     (seuls les statuts active/expired sont recalculés ;
--      pending_payment / cancelled ne sont pas forcés)
--   - réactive le membre si son abonnement redevient actif
--     (même règle que la réactivation à l'achat (00106) :
--      uniquement quand members.status = 'inactive')
-- =============================================================================

-- 0. Helper : le caller est-il admin OU receptionist de l'organisation
CREATE OR REPLACE FUNCTION public.is_admin_or_receptionist(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = p_org_id
      AND ur.role IN ('admin', 'receptionist')
  )
$$;

-- 1. RPC de modification des dates d'abonnement
CREATE OR REPLACE FUNCTION public.update_subscription_dates(
  p_subscription_id UUID,
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub member_subscriptions;
  v_new_status TEXT;
BEGIN
  -- Autorisation serveur : admin ou receptionist uniquement
  IF NOT is_admin_or_receptionist(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or receptionist can update subscription dates';
  END IF;

  -- Validation des dates
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Les dates de début et de fin sont obligatoires';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'La date de début ne peut pas être postérieure à la date de fin';
  END IF;

  -- L'abonnement doit appartenir à l'organisation (verrouillage anti-course)
  SELECT * INTO v_sub
  FROM member_subscriptions
  WHERE id = p_subscription_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription does not belong to this organization';
  END IF;

  -- Recalcul du statut à partir de la nouvelle date de fin
  IF v_sub.status IN ('active', 'expired') THEN
    v_new_status := CASE WHEN p_end_date < CURRENT_DATE THEN 'expired' ELSE 'active' END;
  ELSE
    v_new_status := v_sub.status;
  END IF;

  UPDATE member_subscriptions
  SET start_date = p_start_date,
      end_date = p_end_date,
      status = v_new_status
  WHERE id = p_subscription_id;

  -- Réactivation du membre si son abonnement redevient actif
  IF v_new_status = 'active' THEN
    UPDATE members
    SET status = 'active'
    WHERE id = v_sub.member_id
      AND status = 'inactive';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'status', v_new_status
  );
END;
$$;