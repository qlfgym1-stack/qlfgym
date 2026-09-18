-- 00116 : SUPER_ADMIN / RLS global / MFA / recovery fix
-- ===========================================================
-- 1. Réintroduit le rôle super_admin (protégé : attribuable UNIQUEMENT par
--    service_role, jamais par le frontend).
-- 2. RLS : super_admin accède à toutes les organisations (SELECT/UPDATE).
-- 3. RPC backend d'assignation super_admin (exécuté par un script admin).
-- 4. Fix : recovery_codes.code_hash devient NULLABLE (l'EF recovery écrivait
--    code_hash: null après vérification pour invalider le code).
-- 5. Rôle super_admin non auto-attribuable : la CHECK restreint et aucune
--    policy INSERT/UPDATE n'autorise 'super_admin' côté client.

-- ---------------------------------------------------------------
-- 1. CHECK user_roles : ajouter 'super_admin'
-- ---------------------------------------------------------------
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('super_admin', 'admin', 'coach', 'staff', 'receptionist', 'cleaner'));

-- ---------------------------------------------------------------
-- 2. RLS super_admin global
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM user_roles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "Admins can update their organization" ON organizations;
CREATE POLICY "Admins can update their organization" ON organizations
  FOR UPDATE USING (
    id IN (SELECT organization_id FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- user_roles : SELECT — un super_admin voit tous les rôles (gestion globale),
-- un user normal voit uniquement ses propres rôles.
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------
-- 3. RPC backend d'assignation super_admin (service_role uniquement)
--    Exécutable via : SELECT assign_super_admin_role_by_email('email@x.com');
--    Protégé : le JWT du caller doit avoir role = 'service_role'.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_super_admin_role_by_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_count INTEGER;
  v_first_org_id UUID;
  v_role TEXT;
BEGIN
  IF auth.jwt() ->> 'role' <> 'service_role' THEN
    RETURN jsonb_build_object('error', 'Forbidden: service_role required');
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found in auth.users');
  END IF;

  -- Vérifie qu'il n'existe pas déjà un super_admin (un seul compte global)
  SELECT role INTO v_role FROM user_roles WHERE role = 'super_admin' LIMIT 1;
  IF v_role IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'A super_admin already exists');
  END IF;

  -- Récupère une organisation existante ou crée une org globale dédiée
  SELECT count(*) INTO v_org_count FROM user_roles WHERE user_id = v_user_id;
  IF v_org_count > 0 THEN
    SELECT organization_id INTO v_first_org_id FROM user_roles WHERE user_id = v_user_id LIMIT 1;
  END IF;

  IF v_first_org_id IS NULL THEN
    INSERT INTO organizations (name, slug)
    VALUES (p_email, 'super-admin')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_first_org_id;
  END IF;

  INSERT INTO user_roles (user_id, organization_id, role)
  VALUES (v_user_id, v_first_org_id, 'super_admin')
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'super_admin';

  RETURN jsonb_build_object('user_id', v_user_id, 'organization_id', v_first_org_id, 'role', 'super_admin');
END;
$$;

-- RPC : liste des super_admin (backlog backend, service_role requis)
CREATE OR REPLACE FUNCTION get_super_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_email TEXT;
  v_org UUID;
BEGIN
  IF auth.jwt() ->> 'role' <> 'service_role' THEN
    RETURN jsonb_build_object('error', 'Forbidden: service_role required');
  END IF;

  SELECT user_id, organization_id INTO v_uid, v_org
  FROM user_roles WHERE role = 'super_admin' LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('super_admin', null);
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('user_id', v_uid, 'email', v_email, 'organization_id', v_org);
END;
$$;

-- ---------------------------------------------------------------
-- 4. Fix recovery_codes.code_hash → NULLABLE
--    L'EF recovery (action verify) écrit code_hash: null pour invalider
--    le code après usage — ce qui échouait sur colonne NOT NULL.
-- ---------------------------------------------------------------
ALTER TABLE recovery_codes ALTER COLUMN code_hash DROP NOT NULL;

-- ---------------------------------------------------------------
-- Sécurité : jamais de mutation user_roles côté client pour super_admin.
-- Aucune policy INSERT/UPDATE sur user_roles n'existe pour 'super_admin'
-- (la seule INSERT policy autorise 'staff'/'coach' pour soi-même).
-- Rien à ajouter : l'état est déjà verrouillé. Mais on blinde en cas de
-- fuite future : un trigger refuse toute insertion/update vers 'super_admin'
-- sauf si le caller est service_role.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_client_super_admin_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'super_admin' AND auth.jwt() ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'super_admin role can only be assigned by service_role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_client_super_admin ON user_roles;
CREATE TRIGGER trg_block_client_super_admin
  BEFORE INSERT OR UPDATE OF role ON user_roles
  FOR EACH ROW EXECUTE FUNCTION block_client_super_admin_mutation();