-- ============================================================================
-- Migration 00110: REPLICA IDENTITY FULL pour le realtime du tableau de bord
--
-- Problème : sans `REPLICA IDENTITY FULL`, les événements postgres_changes
-- (INSERT/UPDATE/DELETE) n'emportent que la PK + colonnes modifiées. Le filtre
-- `organization_id=eq.<org>` de `useRealtime` ne peut alors pas être évalué
-- côté serveur sur les UPDATE/DELETE, et l'événement est ignoré : les KPIs
-- (Adhérents Actifs, Check-ins, Taux d'Occupation) ne se mettaient à jour
-- que sur les INSERT.
--
-- Avec `REPLICA IDENTITY FULL`, chaque événement transporte toutes les
-- colonnes → le filtre par organisation fonctionne → invalidation TanStack.
--
-- Boucle idempotente : aucun effet si déjà positionné.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance',
    'members',
    'member_subscriptions',
    'payments',
    'pos_transactions',
    'expenses',
    'products',
    'staff',
    'user_roles'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END
$$;