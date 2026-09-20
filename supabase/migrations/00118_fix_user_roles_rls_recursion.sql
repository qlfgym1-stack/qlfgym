-- 00118 : Fix RLS recursion on user_roles
-- ============================================================
-- Problème : la policy SELECT "Users can view their own roles" (00116)
-- contient un EXISTS (SELECT 1 FROM user_roles ...) qui ré-entrant
-- dans la même policy → infinite recursion (code 42P17).
--
-- Solution : déplacer la vérification super_admin dans une fonction
-- SECURITY DEFINER qui bypass RLS, et l'appeler depuis la policy.

-- 1. Fonction helper : est-ce que l'utilisateur courant est super_admin ?
--    SECURITY DEFINER = s'exécute avec les privilèges du créateur (bypass RLS)
--    SET search_path = public = évite injection via search_path
--    REVOKE EXECUTE FROM PUBLIC = seul le rôle postgres et les owners peuvent l'appeler
--    (les policies RLS s'exécutent avec les privilèges de l'utilisateur connecté,
--     mais la fonction elle-même n'est pas soumise à RLS grâce à SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$;

-- Restreindre l'exécution de la fonction aux rôles nécessaires
REVOKE EXECUTE ON FUNCTION public.is_current_user_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin() TO authenticated;
-- Note : le rôle 'authenticated' est suffisant car la policy s'évalue
-- dans le contexte de l'utilisateur connecté. La fonction étant
-- SECURITY DEFINER, elle lit user_roles sans déclencher la policy SELECT.

-- 2. Supprimer l'ancienne policy qui cause la récursion
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;

-- 3. Recréer la policy sans auto-référence
CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_current_user_super_admin()
  );