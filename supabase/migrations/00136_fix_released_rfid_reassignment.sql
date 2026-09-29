-- =============================================================================
-- 00136_fix_released_rfid_reassignment.sql
-- Corrige le blocage « badge déjà utilisé » lors de la réattribution d'un
-- support RFID/bracelet PRÉALABLEMENT LIBÉRÉ via /rfid-check.
--
-- CAUSE
--   rfid_cards ne conserve QU'UNE ligne par rfid_uid (rfid_cards_rfid_uid_key
--   UNIQUE global). release_support (00134) libère le support en le passant
--   DÉSACTIVÉ + released_at SANS supprimer la ligne. Les deux RPCs confondaient
--   alors « ligne d'historique existante » avec « attribution active » :
--     * check_rfid_available : available=false dès qu'une ligne existe
--     * assign_rfid_card      : refus si la ligne existe (peu importe le statut)
--   Résultat : impossible d'attribuer un support libéré à un nouveau membre,
--   et le check-in refusait (« Badge invalide ») car le support restait DÉSACTIVÉ.
--
-- RÈGLE (demandée explicitement)
--   * Un même RFID peut avoir plusieurs attributions SUCCESSIVES dans le temps,
--     mais jamais deux attributions ACTIVES simultanément.
--   * Seul un support LIBÉRÉ explicitement (released_at renseigné, via
--     /rfid-check) est réutilisable.
--   * Un support DÉSACTIVÉ SANS released_at (perdu / volé / frauduleux) reste
--     non réutilisable (ne peut être réattribué que via assign_released_card).
--   * Le code est une chaîne TEXT : jamais converti ni modifié lors d'une
--     libération/réattribution. Les zéros en tête sont conservés.
--
-- STRATÉGIE (conserve l'historique, ne crée PAS de 2e logique d'attribution)
--   check_rfid_available : renvoie available=true pour un support libéré
--                           (DÉSACTIVÉ + released_at), false sinon.
--   assign_rfid_card      : si la ligne du support existe ET est libérée, on la
--                           RÉATTRIBUE (UPDATE de la MÊME ligne : member_id=B,
--                           status=ACTIF, assigned_at=now, released_at/by=NULL)
--                           car l'INSERT serait impossible (UNIQUE). Le porteur
--                           précédent (A) est tracé dans rfid_audit_log.
--                           Si la ligne est ACTIF ou DÉSACTIVÉ sans released_at
--                           -> refus (inchangé).
--   Le frontend (/members AJOUTER UN MEMBRE -> RfidCreateSection ->
--   assign_rfid_card) n'est pas modifié : une seule logique d'attribution.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. check_rfid_available : un support libéré est « disponible »
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rfid_available(p_rfid_uid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
 AS $$
DECLARE
  v_status TEXT;
  v_member_id UUID;
  v_member_name TEXT;
  v_org_id UUID;
  v_released_at timestamptz;
BEGIN
  SELECT rc.status, rc.member_id, CONCAT(m.first_name, ' ', m.last_name),
         m.organization_id, rc.released_at
    INTO v_status, v_member_id, v_member_name, v_org_id, v_released_at
    FROM rfid_cards rc
    LEFT JOIN members m ON m.id = rc.member_id
    WHERE rc.rfid_uid = p_rfid_uid;

  -- Vérifie que le caller a un rôle dans l'org de cette carte
  IF v_org_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND organization_id = v_org_id
      AND role IN ('admin', 'staff', 'coach')
    ) THEN
      RAISE EXCEPTION 'Access denied: not a member of this organization';
    END IF;
  END IF;

  -- Support inconnu : disponible
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('available', true);
  END IF;

  -- Support LIBÉRÉ explicitement (DÉSACTIVÉ + released_at) : réutilisable
  IF v_status = 'DÉSACTIVÉ' AND v_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('available', true, 'released', true,
      'status', v_status, 'previous_member_id', v_member_id,
      'previous_member_name', v_member_name);
  END IF;

  -- Toute autre présence (ACTIF, REMPLACÉ, PERDU, VOLÉ, BLACKLISTÉ, ou
  -- DÉSACTIVÉ sans libération) = attribution en cours / non réutilisable
  RETURN jsonb_build_object(
    'available', false,
    'status', v_status,
    'member_id', v_member_id,
    'member_name', v_member_name
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. assign_rfid_card : distinguer historique (libéré) vs attribution active
--    Garde la MÊME signature (appelée par le formulaire AJOUTER UN MEMBRE).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_rfid_card(p_member_id uuid, p_rfid_uid text, p_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
 AS $$
DECLARE
  v_card_id UUID;
  v_existing_id UUID;
  v_existing_status TEXT;
  v_existing_released_at timestamptz;
  v_existing_member_id UUID;
  v_existing_member_name TEXT;
  v_old_card_id UUID;
  v_old_uid TEXT;
  v_org_id UUID;
  v_reassign BOOLEAN := false;
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

  -- Analyse de la ligne existante pour ce support (texte exact, zéros conservés)
  SELECT rc.id, rc.status, rc.released_at, rc.member_id,
         CONCAT(m.first_name, ' ', m.last_name)
    INTO v_existing_id, v_existing_status, v_existing_released_at,
         v_existing_member_id, v_existing_member_name
    FROM rfid_cards rc
    LEFT JOIN members m ON m.id = rc.member_id
   WHERE rc.rfid_uid = p_rfid_uid
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Cas 1 : attribution ACTIVE -> refus si elle appartient à AUTRE membre.
    --          (même membre = idempotence : la carte ACTIF est déjà la sienne)
    IF v_existing_status = 'ACTIF' THEN
      IF v_existing_member_id = p_member_id THEN
        RETURN jsonb_build_object('success', true, 'card_id', v_existing_id, 'existing', true);
      END IF;
      RETURN jsonb_build_object('success', false,
        'error', 'Ce badge RFID est déjà attribué à un autre adhérent');
    END IF;
    -- Cas 2 : support LIBÉRÉ (DÉSACTIVÉ + released_at) -> réattribution
    IF v_existing_status = 'DÉSACTIVÉ' AND v_existing_released_at IS NOT NULL THEN
      v_reassign := true;
    -- Cas 3 : inactif SANS libération (perdu/volé/fraude) -> refus
    ELSE
      RETURN jsonb_build_object('success', false,
        'error', 'Ce support est indisponible (non libéré) et ne peut pas être réattribué');
    END IF;
  END IF;

  -- Désactiver l'ancienne carte ACTIF de CE membre (une seule carte active)
  SELECT id, rfid_uid INTO v_old_card_id, v_old_uid
  FROM rfid_cards
  WHERE member_id = p_member_id
    AND status = 'ACTIF'
  ORDER BY created_at DESC LIMIT 1;
  IF v_old_card_id IS NOT NULL AND NOT v_reassign THEN
    UPDATE rfid_cards
    SET status = 'DÉSACTIVÉ',
        replaced_at = now(),
        notes = COALESCE(notes, '') || ' | Remplacée le ' || now()::date || ' par ' || p_rfid_uid,
        updated_at = now()
    WHERE id = v_old_card_id;

    INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
    VALUES (p_member_id, v_old_uid, p_rfid_uid, 'REPLACE', 'Ancienne carte désactivée automatiquement', 'Une seule carte ACTIF par membre', p_created_by);
  END IF;

  IF v_reassign THEN
    -- Réattribution d'un support libéré : UPDATE de la MÊME ligne (UNIQUE)
    UPDATE rfid_cards
    SET member_id = p_member_id,
        status = 'ACTIF',
        assigned_at = now(),
        released_at = NULL,
        released_by = NULL,
        replaced_at = NULL,
        reason = p_reason,
        notes = p_notes,
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_card_id;

    INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
    VALUES (p_member_id, p_rfid_uid, p_rfid_uid, 'ASSIGN',
            'Réattribution d''un support libéré',
            'Porteur précédent : ' || COALESCE(v_existing_member_name, 'inconnu') ||
            ' | ancienne attribution conservée dans l''historique', p_created_by);

    RETURN jsonb_build_object('success', true, 'card_id', v_card_id, 'reassigned', true,
      'member_id', p_member_id);
  END IF;

  -- Nouveau support (aucune ligne existante) : INSERT
  INSERT INTO rfid_cards (member_id, rfid_uid, status, reason, notes, created_by)
    VALUES (p_member_id, p_rfid_uid, 'ACTIF', p_reason, p_notes, p_created_by)
    RETURNING id INTO v_card_id;

  INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
    VALUES (p_member_id, NULL, p_rfid_uid, 'ASSIGN', p_reason, p_notes, p_created_by);

  RETURN jsonb_build_object('success', true, 'card_id', v_card_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rfid_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rfid_available(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_rfid_card(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_rfid_card(uuid, text, text, text, uuid) TO authenticated;
