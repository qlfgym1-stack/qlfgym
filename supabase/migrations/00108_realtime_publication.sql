-- ============================================================================
-- Migration 00108: Realtime publication for dashboard KPIs
--
-- Pour que les hooks `useRealtime` (postgres_changes) reçoivent les événements
-- (INSERT/UPDATE/DELETE), chaque table lue par le tableau de bord doit faire
-- partie de la publication `supabase_realtime`. Sans cela, les KPI ne se
-- mettaient à jour que via le polling 30s (voire pas du tout).
--
-- Ajout idempotent : on n'ajoute une table que si elle n'est pas déjà
-- présente dans la publication (évite l'erreur "already in publication").
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
    'staff',
    'products',
    'expenses',
    'user_roles'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
