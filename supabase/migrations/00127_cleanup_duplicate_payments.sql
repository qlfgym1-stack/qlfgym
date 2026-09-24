-- 00127_cleanup_duplicate_payments.sql
-- Nettoyage data suite à l'audit encaissements/RFID :
--   A. Annulation logique des paiements 'completed' en double
--      (même membre + même jour + même montant + même méthode + même type d'abonnement).
--      Règle de conservation : dans chaque groupe, garder d'abord le paiement lié à une
--      souscription 'active' (s'il y en a un seul), sinon le premier chronologique ;
--      les autres passent 'cancelled' avec cancelled_at + traçage payment_changes.
--   B. Expiration des abonnements 'pending_payment' dont la date de fin est dépassée.
--   C. Désactivation des cartes RFID ACTIF dont l'UID est corrompu
--      (octets non UTF-8 / caractères de contrôle / concaténations numériques > 12 chiffres).

-- =============================================================================
-- A. Paiements en double
-- =============================================================================
WITH ranked AS (
  SELECT
    p.id AS payment_id,
    p.member_id,
    p.organization_id,
    p.amount,
    p.payment_date,
    p.payment_method,
    ms.status AS sub_status,
    row_number() OVER (
      PARTITION BY p.member_id, p.payment_date::date, p.amount, p.payment_method, ms.subscription_type_id
      ORDER BY
        (CASE WHEN ms.status = 'active' THEN 0 ELSE 1 END),
        p.created_at,
        p.id
    ) AS keep_rank
  FROM payments p
  LEFT JOIN member_subscriptions ms ON ms.id = p.subscription_id
  WHERE p.status = 'completed'
)
UPDATE payments p
SET status = 'cancelled',
    cancelled_at = COALESCE(p.cancelled_at, now()),
    cancellation_reason = 'Doublon détecté par audit (même membre/jour/montant/méthode/type)'
FROM ranked r
WHERE r.payment_id = p.id
  AND r.keep_rank > 1;

-- Traçage des annulations dans payment_changes (source 'subscription')
INSERT INTO public.payment_changes (organization_id, user_id, member_id, source, payment_id, action, old_data, new_data, reason)
SELECT
  p.organization_id,
  NULL,
  p.member_id,
  'subscription',
  p.id,
  'cancel',
  jsonb_build_object('status', 'completed', 'amount', p.amount, 'payment_date', p.payment_date),
  jsonb_build_object('status', 'cancelled', 'cancelled_at', p.cancelled_at),
  p.cancellation_reason
FROM payments p
WHERE p.status = 'cancelled'
  AND p.cancelled_at IS NOT NULL
  AND p.cancelled_at > now() - interval '10 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_changes pc
    WHERE pc.payment_id = p.id AND pc.action = 'cancel'
  );

-- =============================================================================
-- B. Abonnements pending_payment expirés
-- =============================================================================
UPDATE member_subscriptions
SET status = 'expired'
WHERE status = 'pending_payment'
  AND end_date < CURRENT_DATE;

-- =============================================================================
-- C. Cartes RFID corrompues -> DÉSACTIVÉ (UID jamais lisible par le tourniquet)
-- =============================================================================
CREATE TEMP TABLE _corrupted_cards ON COMMIT DROP AS
  SELECT id, member_id, rfid_uid
  FROM rfid_cards
  WHERE status = 'ACTIF'
    AND (
      octet_length(rfid_uid) <> length(rfid_uid)
      OR rfid_uid ~ '[[:cntrl:]]'
      OR (length(rfid_uid) > 12 AND rfid_uid ~ '^[0-9]+$')
    );

UPDATE rfid_cards rc
SET status = 'DÉSACTIVÉ',
    reason = 'UID corrompu (lecture impossible)',
    notes = COALESCE(rc.notes, '') || ' | Désactivée le ' || now()::date || ' par audit UID',
    updated_at = now()
FROM _corrupted_cards c
WHERE rc.id = c.id;

INSERT INTO rfid_audit_log (member_id, old_rfid_uid, new_rfid_uid, action, reason, notes, created_by)
SELECT c.member_id, c.rfid_uid, c.rfid_uid, 'DEACTIVATE', 'UID corrompu (audit)', 'Désactivée le ' || now()::date || ' par audit UID', NULL
FROM _corrupted_cards c;