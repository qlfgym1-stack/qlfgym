-- 00146_drop_diag_tmp.sql
-- Nettoyage : la migration de diagnostic 00145 a été appliquée par inadvertance
-- (la fonction n'avait jamais été appelée, donc aucune erreur n'a été levée) et
-- son entrée a été revertie via `supabase migration repair --status reverted 00145`.
-- La fonction créée par cette migration reste toutefois en base : on la supprime.
DROP FUNCTION IF EXISTS public.diag_notice_check();
DROP FUNCTION IF EXISTS public.diag_report();