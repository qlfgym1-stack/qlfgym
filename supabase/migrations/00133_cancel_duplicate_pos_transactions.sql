-- ============================================================================
-- 00133 — Annulation de transactions POS dupliquees (cluster 21/09 17:43)
-- ============================================================================
-- Contexte : audit du 26/09/2026 sur la page /encaissement.
--
-- Le membre 58e3f840-6df0-4abd-8613-0f4acc369f59 (Safer Abdellah) possede
-- 9 transactions POS 'completed' de 2 000 DA chacune, creees entre 17:42:53
-- et 17:43:53 le 21/09/2026, TOUTES referencant la meme subscription
-- b70a4398-5ce1-4f20-8d1d-605df0c6f955, pour un seul paiement de 2 000 DA.
--
-- Ces 8 transactions en trop etaient comptees en double sur /encaissement :
-- le dedup (src/lib/ledger-dedupe.ts) apparie sur la cle
-- membre|montant|minute, or ces lignes tombent sur la minute 17:43 alors
-- que le paiement est horodate 17:42:53 -> aucune correspondance.
-- Impact : 16 000 DA gonflaient le CA de la semaine et du mois.
--
-- Ces paniers ne contiennent que l'item virtuel __subscription__ : aucun
-- produit physique, donc aucun impact sur le stock a restauer.
--
-- On conserve la 1re transaction (f192f85e, 17:42:53), celle qui est
-- effectivement appariee au paiement de 2 000 DA.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _dup_pos_00133 (id uuid PRIMARY KEY);

INSERT INTO _dup_pos_00133 (id) VALUES
  ('f7e210cd-d111-4664-a090-67fb0f31d81e'),
  ('84ea4c83-7cd7-4a32-a5a6-0e156d40ddc4'),
  ('b26f96c3-f48a-45c5-aa22-765d35983414'),
  ('2f1d7558-967f-433f-8800-22682be6f63b'),
  ('5a17d05e-2a95-4818-bb31-7b020a7828aa'),
  ('36bc729f-779c-44cc-a4e6-6fa0e1a89931'),
  ('8452c163-2b21-46cf-ac86-949300c457ea'),
  ('78a3369c-8801-4f4d-9414-0fc9479acb9a');

-- 1) Annulation logique (idempotent : ne touche que les lignes 'completed')
UPDATE pos_transactions tx
SET payment_status       = 'cancelled',
    cancelled_at         = COALESCE(tx.cancelled_at, now()),
    cancellation_reason  = 'Doublon detecte par audit : meme membre, meme abonnement, meme montant, 8 transactions en 17 secondes pour un seul paiement (cluster 21/09/2026 17:43)'
FROM _dup_pos_00133 d
WHERE tx.id = d.id
  AND tx.payment_status = 'completed';

-- 2) Tracabilite dans payment_changes (source 'pos', action 'cancel')
--    Alimente l'historique affiche dans /encaissement.
INSERT INTO public.payment_changes
  (organization_id, user_id, member_id, source, pos_transaction_id, action, old_data, new_data, reason)
SELECT
  tx.organization_id,
  NULL,
  tx.member_id,
  'pos',
  tx.id,
  'cancel',
  jsonb_build_object('payment_status', 'completed', 'total', tx.total,
                    'payment_method', tx.payment_method, 'created_at', tx.created_at),
  jsonb_build_object('payment_status', 'cancelled', 'cancelled_at', tx.cancelled_at),
  tx.cancellation_reason
FROM pos_transactions tx
JOIN _dup_pos_00133 d ON d.id = tx.id
WHERE tx.payment_status = 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_changes pc
    WHERE pc.pos_transaction_id = tx.id AND pc.action = 'cancel'
  );

DROP TABLE _dup_pos_00133;

COMMIT;
