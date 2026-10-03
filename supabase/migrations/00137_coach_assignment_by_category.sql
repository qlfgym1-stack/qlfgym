-- ============================================================================
-- 00137 — Affectation membres ↔ coach par catégorie (homme / femme / garçon / fille)
-- ============================================================================
--
-- OBJECTIF
--   1. Une catégorie DERIVÉE (jamais stockée) par adhérent, pour éviter toute
--      dérive quand un enfant vieillit : homme, femme, enfant garçon, enfant fille.
--   2. Un module d'affectation par lot, atomique et journalisé.
--   3. Une paie coach qui distingue les catégories, avec repli sur le taux actuel
--      (donc zéro changement de comportement tant que rien n'est saisi).
--
-- CONSTAT DÉCLENCHEUR (mesuré en base)
--   - gender ne contient que 'male' / 'female' : il n'existe aucune notion d'enfant.
--   - 25 birth_date corrompues (21 avant 1900, 4 dans le futur) faussent tout calcul
--     d'âge -> elles sont mises à NULL et classées 'unknown'.
--   - 1 460 membres, 23 affectés à un coach : le module répond à un manque réel.
--
-- SEUIL D'ÂGE : 16 ans (arbitrage produit). Modifiable ici, c'est le seul endroit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Âge en années pleines, NULL si inexploitable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_age(p_birth_date date)
RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_birth_date IS NULL              THEN NULL
    WHEN p_birth_date > CURRENT_DATE       THEN NULL   -- date future : saisie erronée
    WHEN p_birth_date < CURRENT_DATE - INTERVAL '120 years' THEN NULL  -- centenaire : import cassé
    ELSE date_part('year', age(CURRENT_DATE, p_birth_date))::integer
  END;
$$;

COMMENT ON FUNCTION public.member_age(date) IS
  'Âge en années pleines, NULL si birth_date est absente, future ou aberrante (>120 ans).';

-- ----------------------------------------------------------------------------
-- 2. Catégorie dérivée — SOURCE DE VÉRITÉ UNIQUE
-- ----------------------------------------------------------------------------
--   'adult_male' | 'adult_female' | 'boy' | 'girl' | 'unknown'
--
--   'unknown' couvre : genre non reconnu, date de naissance absente/incohérente.
--   Ce n'est PAS une 5ᵉ catégorie de paie : elle suit le taux de base du coach.
CREATE OR REPLACE FUNCTION public.member_category(p_gender text, p_birth_date date)
RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  WITH g AS (
    SELECT lower(btrim(coalesce(p_gender, ''))) AS v
  ), a AS (
    SELECT public.member_age(p_birth_date) AS years
  )
  SELECT CASE
    WHEN (SELECT years FROM a) IS NULL OR (SELECT years FROM a) > 120
      THEN 'unknown'
    WHEN (SELECT v FROM g) IN ('male','m','homme','masculin','boy','garcon','garçon')
      THEN CASE WHEN (SELECT years FROM a) < 16 THEN 'boy' ELSE 'adult_male' END
    WHEN (SELECT v FROM g) IN ('female','f','femme','feminin','féminin','girl','fille')
      THEN CASE WHEN (SELECT years FROM a) < 16 THEN 'girl' ELSE 'adult_female' END
    ELSE 'unknown'
  END;
$$;

COMMENT ON FUNCTION public.member_category(text, date) IS
  'Catégorie dérivée de l''adhérent : adult_male | adult_female | boy | girl | unknown. Seuil enfant = 16 ans.';

-- ----------------------------------------------------------------------------
-- 3. Nettoyage des dates de naissance inexploitables (25 lignes)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.members
     SET birth_date = NULL
   WHERE birth_date IS NOT NULL
     AND (birth_date > CURRENT_DATE OR birth_date < CURRENT_DATE - INTERVAL '120 years');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'member_category : % birth_date inexploitables mises à NULL', v_n;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Vue d'affectation (RLS respectée via security_invoker)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.member_assignment_view
WITH (security_invoker = on) AS
SELECT
  m.id,
  m.organization_id,
  m.member_number,
  m.first_name,
  m.last_name,
  m.full_name,
  m.gender,
  m.birth_date,
  m.phone,
  m.photo_url,
  m.status,
  m.coach_id,
  public.member_age(m.birth_date)    AS age,
  public.member_category(m.gender, m.birth_date) AS category,
  cs.first_name AS coach_first_name,
  cs.last_name  AS coach_last_name
FROM public.members m
LEFT JOIN public.staff cs ON cs.id = m.coach_id;

COMMENT ON VIEW public.member_assignment_view IS
  'Membres + catégorie dérivée + coach. security_invoker : les RLS de members/staff s''appliquent.';

-- Pas d'index sur `member_category(...)` : la fonction dépend de CURRENT_DATE,
-- donc elle est STABLE et non IMMUTABLE — PostgreSQL refuse un index sur
-- expression non IMMUTABLE. La catégorie est de toute façon dérivée, donc
-- indexée ne veut rien dire ; le filtrage s'appuie sur les index existants
-- (organization_id, coach_id, status). À 1 460 membres le coût est négligeable.
CREATE INDEX IF NOT EXISTS idx_members_org_status_coach
  ON public.members (organization_id, status, coach_id);

-- ----------------------------------------------------------------------------
-- 5. Taux de paie par catégorie (avec repli sur staff.rate_per_member)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_category_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  category        text NOT NULL CHECK (category IN ('adult_male','adult_female','boy','girl')),
  rate            numeric(12,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_category_rates_unique UNIQUE (staff_id, category)
);

CREATE INDEX IF NOT EXISTS idx_coach_category_rates_org
  ON public.coach_category_rates (organization_id, staff_id);

ALTER TABLE public.coach_category_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_category_rates_read" ON public.coach_category_rates;
CREATE POLICY "coach_category_rates_read" ON public.coach_category_rates
  FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "coach_category_rates_admin_write" ON public.coach_category_rates;
CREATE POLICY "coach_category_rates_admin_write" ON public.coach_category_rates
  FOR ALL USING (
    public.is_org_member(organization_id)
    AND EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.organization_id = coach_category_rates.organization_id
                  AND ur.role = 'admin')
  ) WITH CHECK (
    public.is_org_member(organization_id)
    AND EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.organization_id = coach_category_rates.organization_id
                  AND ur.role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.touch_coach_category_rates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coach_category_rates_touch ON public.coach_category_rates;
CREATE TRIGGER trg_coach_category_rates_touch
  BEFORE UPDATE ON public.coach_category_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_coach_category_rates();

-- ----------------------------------------------------------------------------
-- 6. Journal d'affectation (traçabilité, une ligne par membre touché)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_assignment_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id         uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  previous_coach_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  new_coach_id      uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  action            text NOT NULL CHECK (action IN ('assign','reassign','unassign')),
  reason            text,
  actor_id          uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_assignment_audit_org_date
  ON public.coach_assignment_audit (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_assignment_audit_member
  ON public.coach_assignment_audit (member_id, created_at DESC);

ALTER TABLE public.coach_assignment_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_assignment_audit_read" ON public.coach_assignment_audit;
CREATE POLICY "coach_assignment_audit_read" ON public.coach_assignment_audit
  FOR SELECT USING (public.is_org_member(organization_id));

-- Écriture : reservee a la RPC SECURITY DEFINER, qui s'execute en dehors du
-- contexte RLS de l'appelant. Aucune policy INSERT n'est donc ouverte au
-- client : le journal ne peut pas etre forge depuis le navigateur.

-- ----------------------------------------------------------------------------
-- 7. RPC list_coaches — liste des coachs actifs + effectifs par catégorie + taux
-- ----------------------------------------------------------------------------
-- Les compteurs par catégorie portent sur les membres ACTIFS uniquement
-- (c'est la base de la paie today) ; total_count englobe tous les statuts.
CREATE OR REPLACE FUNCTION public.list_coaches(p_org_id uuid)
RETURNS TABLE (
  id                 uuid,
  first_name         text,
  last_name          text,
  email              text,
  phone              text,
  salary             numeric,
  rate_per_member    numeric,
  bonus              numeric,
  adult_male_count   integer,
  adult_female_count integer,
  boy_count          integer,
  girl_count         integer,
  unknown_count      integer,
  active_total       integer,
  total_count        integer,
  rates              jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.first_name, s.last_name, s.email, s.phone,
    COALESCE(s.salary, 0), COALESCE(s.rate_per_member, 0), COALESCE(s.bonus, 0),
    COALESCE(k.adult_male, 0)::int,
    COALESCE(k.adult_female, 0)::int,
    COALESCE(k.boy, 0)::int,
    COALESCE(k.girl, 0)::int,
    COALESCE(k.unknown, 0)::int,
    COALESCE(k.active_total, 0)::int,
    COALESCE(k.total_count, 0)::int,
    COALESCE((
      SELECT jsonb_object_agg(v.cat, COALESCE(r.rate, s.rate_per_member, 0))
      FROM (VALUES ('adult_male'),('adult_female'),('boy'),('girl')) AS v(cat)
      LEFT JOIN public.coach_category_rates r
             ON r.staff_id = s.id AND r.category = v.cat
    ), '{}'::jsonb)
  FROM public.staff s
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE m.status = 'active' AND public.member_category(m.gender, m.birth_date) = 'adult_male')   AS adult_male,
      count(*) FILTER (WHERE m.status = 'active' AND public.member_category(m.gender, m.birth_date) = 'adult_female') AS adult_female,
      count(*) FILTER (WHERE m.status = 'active' AND public.member_category(m.gender, m.birth_date) = 'boy')          AS boy,
      count(*) FILTER (WHERE m.status = 'active' AND public.member_category(m.gender, m.birth_date) = 'girl')         AS girl,
      count(*) FILTER (WHERE m.status = 'active' AND public.member_category(m.gender, m.birth_date) = 'unknown')      AS unknown,
      count(*) FILTER (WHERE m.status = 'active') AS active_total,
      count(*) AS total_count
    FROM public.members m
    WHERE m.coach_id = s.id
  ) k ON true
  WHERE s.organization_id = p_org_id
    AND s.is_active = true
    AND s.role ILIKE '%coach%'
  ORDER BY s.first_name, s.last_name;
END;
$$;

COMMENT ON FUNCTION public.list_coaches(uuid) IS
  'Coachs actifs d''une organisation avec effectifs actifs par catégorie et taux effectifs (repli sur staff.rate_per_member).';

-- ----------------------------------------------------------------------------
-- 8. RPC assign_members_to_coach — affectation par lot, atomique et journalisée
-- ----------------------------------------------------------------------------
-- p_coach_id NULL = désaffecter. p_member_ids est dédupliqué en interne.
CREATE OR REPLACE FUNCTION public.assign_members_to_coach(
  p_member_ids uuid[],
  p_coach_id   uuid,
  p_reason     text DEFAULT NULL
)
RETURNS TABLE (member_id uuid, success boolean, info text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org      uuid;
  v_target   uuid;
  v_prev     uuid;
  v_n        integer := 0;
  v_action   text;
  m          uuid;
BEGIN
  SELECT ur.organization_id INTO v_org
    FROM public.user_roles ur
   WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
   LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(array_length(p_member_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Aucun membre sélectionné' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_member_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Lot trop important (500 maximum par requête)' USING ERRCODE = '22023';
  END IF;

  IF p_coach_id IS NOT NULL THEN
    SELECT s.id INTO v_target
      FROM public.staff s
     WHERE s.id = p_coach_id
       AND s.organization_id = v_org
       AND s.is_active = true
       AND s.role ILIKE '%coach%';
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'Coach introuvable, inactif ou hors organisation' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- DISTINCT : un id répété ne doit pas produire deux écritures.
  FOR m IN SELECT DISTINCT unnest(p_member_ids) LOOP
    SELECT mm.coach_id INTO v_prev
      FROM public.members mm
     WHERE mm.id = m AND mm.organization_id = v_org
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT m, false, 'Membre introuvable dans cette organisation';
      CONTINUE;
    END IF;

    UPDATE public.members SET coach_id = v_target WHERE id = m;

    v_action := CASE
      WHEN v_prev IS NULL AND v_target IS NOT NULL THEN 'assign'
      WHEN v_prev IS NOT NULL AND v_target IS NULL THEN 'unassign'
      ELSE 'reassign'
    END;

    INSERT INTO public.coach_assignment_audit
      (organization_id, member_id, previous_coach_id, new_coach_id, action, reason, actor_id)
    VALUES (v_org, m, v_prev, v_target, v_action, p_reason, auth.uid());

    v_n := v_n + 1;
    RETURN QUERY SELECT m, true,
      CASE v_action WHEN 'assign' THEN 'Affecté' WHEN 'unassign' THEN 'Désaffecté' ELSE 'Réaffecté' END;
  END LOOP;

  RAISE NOTICE 'assign_members_to_coach : % membre(s) traité(s)', v_n;
END;
$$;

COMMENT ON FUNCTION public.assign_members_to_coach(uuid[], uuid, text) IS
  'Affecte/désaffecte un lot de membres à un coach en une transaction, journalise chaque ligne. Admin uniquement. p_coach_id NULL = désaffecter.';

-- ----------------------------------------------------------------------------
-- 9. Historique des affectations d'un membre
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_assignment_history(p_member_id uuid)
RETURNS TABLE (
  id uuid, action text, reason text, created_at timestamptz,
  previous_coach_id uuid, new_coach_id uuid,
  previous_coach_name text, new_coach_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT m.organization_id INTO v_org FROM public.members m WHERE m.id = p_member_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Membre introuvable' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT a.id, a.action, a.reason, a.created_at, a.previous_coach_id, a.new_coach_id,
         trim(coalesce(ps.first_name,'') || ' ' || coalesce(ps.last_name,'')),
         trim(coalesce(ns.first_name,'') || ' ' || coalesce(ns.last_name,''))
    FROM public.coach_assignment_audit a
    LEFT JOIN public.staff ps ON ps.id = a.previous_coach_id
    LEFT JOIN public.staff ns ON ns.id = a.new_coach_id
   WHERE a.member_id = p_member_id
   ORDER BY a.created_at DESC
   LIMIT 50;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Droits
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.member_age(date)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_category(text, date)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_coaches(uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_members_to_coach(uuid[], uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_assignment_history(uuid)           TO authenticated, service_role;
GRANT SELECT ON public.member_assignment_view                              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_category_rates        TO authenticated;
GRANT SELECT ON public.coach_assignment_audit                             TO authenticated;