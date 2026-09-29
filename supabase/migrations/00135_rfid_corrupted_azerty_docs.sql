-- =============================================================================
-- 00135_rfid_corrupted_azerty_docs.sql
-- Documentation de codes RFID corrompus AZERTY — AUCUNE conversion appliquée.
--
-- GENÈSE (analyse DB, 29/09/2026)
-- Le lecteur RFID émet l'UID comme frappes clavier. Sur un écran configuré en
-- AZERTY, les touches numériques sans Shift produisent leurs symboles :
--   1→&  2→é  3→"  4→'  5→(  6→-  7→è  8→_  9→ç  0→à
-- Les assignations faites sur de tels écrans (13/08→22/09/2026, par
-- assign_rfid_card qui stocke l'UID tel quel) ont donc enregistré des codes
-- corrompus (ex. "ààé"-&&-&(" = 0023611615 lu en AZERTY).
--
-- CONSTAT : les 14 codes corrompus de rfid_cards sont tous des DOUBLONS d'un
-- badge déjà enregistré proprement :
--   * 12 codes → leur valeur convertie existe DÉJÀ dans rfid_cards (même
--     membre, badge ACTIF) → convertir violerait rfid_cards_rfid_uid_key
--     (UNIQUE global).
--   *  2 codes "concaténés" (double lecture du même badge) → le vrai code est
--     déjà en base ; la conversion produirait des codes fantômes inutilisables.
--   *  1 collision transversale (KHORSI JALEL "àààà&è_-éé" → 0000178622 =
--     badge ACTIF de Hammadi Abdelkrim) → convertir réassignerait le badge
--     d'un autre membre.
--
-- DÉCISION (validée utilisateur) : FIGER en audit, NE PAS convertir ni
-- supprimer. Les cartes corrompues restent DÉSACTIVÉ ("UID corrompu (audit)"
-- du 24/09/2026), l'historique/les attributions/les dates sont conservés.
-- La conversion AZERTY est gérée pour les NOUVEAUX scans côté frontend
-- (src/lib/azerty.ts). Cette migration est IDEMPOTENTE : elle n'insère
-- une entrée ARCHIVE que si elle n'existe pas déjà pour la même carte.
-- =============================================================================

INSERT INTO public.rfid_audit_log
  (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
SELECT
  c.member_id,
  c.rfid_uid,                                    -- ancien / réel (non modifié)
  c.rfid_uid,                                    -- nouveau = inchangé (aucune conversion)
  'ARCHIVE',
  'UID corrompu AZERTY — documenté, aucune conversion (doublon du badge existant)',
  'UNIQUE forcé | convertible="' || translate(c.rfid_uid, '&éÉ"''(-èÈ_çÇàÀ', '12234567789900') ||
    '" | badge_existant="' || COALESCE(d.rfid_uid, '(aucun)') ||
    '" (statut ' || COALESCE(d.status, '-') || ') | Convertir violerait la contrainte UNIQUE sur rfid_uid',
  NULL
FROM public.rfid_cards c
LEFT JOIN LATERAL (
  SELECT d.rfid_uid, d.status
  FROM public.rfid_cards d
  WHERE d.rfid_uid = translate(c.rfid_uid, '&éÉ"''(-èÈ_çÇàÀ', '12234567789900')
    AND d.id <> c.id
  LIMIT 1
) d ON true
WHERE translate(c.rfid_uid, '&éÉ"''(-èÈ_çÇàÀ', '12234567789900') <> c.rfid_uid
  AND NOT EXISTS (
    SELECT 1 FROM public.rfid_audit_log a
    WHERE a.member_id = c.member_id
      AND a.action = 'ARCHIVE'
      AND a.old_rfid_uid IS NOT DISTINCT FROM c.rfid_uid
      AND a.notes LIKE '%UID corrompu AZERTY%'
  );