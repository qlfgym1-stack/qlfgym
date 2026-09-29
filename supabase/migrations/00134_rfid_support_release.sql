-- =============================================================================
-- 00134_rfid_support_release.sql
-- Module Check RFID / Bracelet — action « Désactiver / Libérer » :
--   * libération d'un support attribué (jamais de suppression, historique conservé)
--   * réattribution du MÊME support (UPDATE de la même ligne, pas INSERT,
--     car rfid_uid est UNIQUE global — une 2e ligne serait impossible)
-- Aucune modification des fonctionnalités RFID existantes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes de trace de libération (extension strictement nécessaire)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rfid_cards
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. RPC : release_support — libérer un support actuellement attribué
--    * ne supprime JAMAIS la ligne ; conserve member_id, rfid_uid, assigned_at
--    * enregistre released_at / released_by / motif (history + audit conservés)
--    * passe le support en état réutilisable (DÉSACTIVÉ + released_at)
--    * refuse le cross-org (is_org_member) et une désactivation d'un support
--      non attribué ou déjà libéré
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_support(
  p_card_id uuid,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_org_id uuid;
  v_rfid_uid text;
  v_member_name text;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  -- Support existe + org résolue via le membre (rfid_cards n'a pas d'organization_id)
  SELECT rc.member_id, rc.status, rc.rfid_uid,
         m.organization_id, m.first_name || ' ' || m.last_name
    INTO v_member_id, v_status, v_rfid_uid, v_org_id, v_member_name
    FROM rfid_cards rc
    JOIN members m ON m.id = rc.member_id
    WHERE rc.id = p_card_id;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Support introuvable');
  END IF;

  -- Garde org : le caller doit appartenir à l'org du membre propriétaire
  IF NOT public.is_org_member(v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès non autorisé');
  END IF;

  -- Garde rôle admin (mutation)
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND organization_id = v_org_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Droits admin requis');
  END IF;

  -- Le support doit être attribué et actif
  IF v_status != 'ACTIF' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Le support doit être attribué (ACTIF) pour être libéré (statut actuel : ' || v_status || ')');
  END IF;

  -- Libération : la ligne est conservée, seul le statut passe en réutilisable
  UPDATE rfid_cards
     SET status = 'DÉSACTIVÉ',
         released_at = now(),
         released_by = auth.uid(),
         reason = COALESCE(p_reason, reason),
         notes = COALESCE(p_notes, notes),
         updated_at = now()
   WHERE id = p_card_id;

  -- Audit : action DEACTIVATE, membre conservé (historique + conflits visibles)
  INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
  VALUES (v_member_id, v_rfid_uid, v_rfid_uid, 'DEACTIVATE',
          'Support libéré (Désactiver/Libérer)', COALESCE(p_reason, p_notes), auth.uid());

  RETURN jsonb_build_object('success', true, 'card_id', p_card_id, 'rfid_uid', v_rfid_uid,
    'status', 'DÉSACTIVÉ', 'released', true, 'member_id', v_member_id, 'member_name', v_member_name);
END;
$$;

-- Exécution limitée aux utilisateurs authentifiés (les gardes auth/org/role
-- dans le corps restent la protection réelle ; cohérent avec les autres RPCs)
REVOKE EXECUTE ON FUNCTION public.release_support(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_support(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC : assign_released_card — réattribuer un support libéré à un autre membre
--    * UPDATE de la MÊME ligne (l'UNIQUE sur rfid_uid interdit un INSERT)
--    * garde org : la carte appartient déjà à l'org du nouveau membre
--    * le nouveau membre ne doit pas déjà avoir une carte ACTIF
--    * ne peut porter que sur un support libéré (status DÉSACTIVÉ/ARCHIVÉ
--      AVEC released_at) — jamais sur un support désactivé pour fraude/perte
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_released_card(
  p_card_id uuid,
  p_member_id uuid,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_org uuid;
  v_target_org uuid;
  v_status text;
  v_released_at timestamptz;
  v_rfid_uid text;
  v_target_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  -- Support : statut réutilisable + libéré
  SELECT rc.status, rc.released_at, rc.rfid_uid, m.organization_id
    INTO v_status, v_released_at, v_rfid_uid, v_card_org
    FROM rfid_cards rc
    JOIN members m ON m.id = rc.member_id
    WHERE rc.id = p_card_id;

  IF v_rfid_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Support introuvable');
  END IF;

  IF v_status NOT IN ('DÉSACTIVÉ', 'ARCHIVÉ') OR v_released_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Ce support n''est pas libéré (il ne peut pas être réattribué)');
  END IF;

  -- Membre cible
  SELECT organization_id, first_name || ' ' || last_name
    INTO v_target_org, v_target_name
    FROM members WHERE id = p_member_id;

  IF v_target_org IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Membre introuvable');
  END IF;

  -- Garde org : l'org de la carte ET celle du nouveau membre doivent être
  -- accessibles par le caller (anti cross-org de bout en bout)
  IF NOT public.is_org_member(v_card_org) OR NOT public.is_org_member(v_target_org) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès non autorisé');
  END IF;

  -- Anti cross-org : la carte et le nouveau membre dans la même organisation
  IF v_card_org != v_target_org THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le support appartient à une autre organisation');
  END IF;

  -- Membre cible ne doit pas déjà avoir une carte ACTIF
  IF EXISTS (
    SELECT 1 FROM rfid_cards
    WHERE member_id = p_member_id AND status = 'ACTIF' AND id != p_card_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Ce membre possède déjà une carte active');
  END IF;

  -- Réattribution : UPDATE de la même ligne, nouveau membre, support réactivé
  UPDATE rfid_cards
     SET member_id = p_member_id,
         status = 'ACTIF',
         assigned_at = now(),
         released_at = NULL,
         released_by = NULL,
         reason = COALESCE(p_reason, reason),
         notes = COALESCE(p_notes, notes),
         updated_at = now()
   WHERE id = p_card_id;

  -- Audit : ASSIGN — l'ancien membre reste tracé par l'action DEACTIVATE précédente
  INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
  VALUES (p_member_id, v_rfid_uid, v_rfid_uid, 'ASSIGN',
          'Réattribution d''un support libéré', COALESCE(p_reason, p_notes), auth.uid());

  RETURN jsonb_build_object('success', true, 'card_id', p_card_id, 'rfid_uid', v_rfid_uid,
    'status', 'ACTIF', 'member_id', p_member_id, 'member_name', v_target_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_released_card(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_released_card(uuid, uuid, text, text) TO authenticated;