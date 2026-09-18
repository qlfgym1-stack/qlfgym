-- 00117 : auto_assign_owner_role ignore les créations système (auth.uid() NULL)
-- ==========================================================================
-- Problème : quand un RPC service_role crée une organisation sans owner associé
-- (ex : assign_super_admin_role_by_email pour un SUPER_ADMIN sans salle), le
-- trigger after_organization_insert insérait user_roles avec user_id = NULL
-- (auth.uid() est NULL pour le JWT service_role) → violation de NOT NULL qui
-- annulait toute la transaction.
--
-- Correction (non destructive) : le trigger ne fait rien quand auth.uid() est
-- NULL. Les créations client (sign-up) gardent l'auto-assignation 'admin', et
-- les RPC système gèrent explicitement les rôles des organisations qu'ils créent.

CREATE OR REPLACE FUNCTION public.auto_assign_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (auth.uid(), NEW.id, 'admin');
  RETURN NEW;
END;
$$;

-- Le trigger after_organization_insert référence la fonction par son nom :
-- aucune recréation nécessaire, la nouvelle définition s'applique.