-- ============================================================================
-- 00139 — Restreint list_coaches aux rôles qui gèrent la paie
-- ============================================================================
-- `list_coaches` (00137) renvoie `salary`, `rate_per_member`, `bonus` et le
-- calcul de variable. Sa garde `is_org_member` laissait passer TOUT rôle non
-- « cleaner », donc un coach pouvait lire la rémunération de ses collègues.
--
-- On aligne sur la logique de `get_staff_roster` (00120), qui réserve déjà le
-- roster à admin/réception : seule la réception et l'administratrice gèrent la
-- paie dans cette application.
-- ============================================================================

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
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.organization_id = p_org_id
       AND ur.role IN ('admin', 'receptionist')
  ) THEN
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
  'Coachs actifs avec effectifs et taux. Réservé à admin/réception : la fonction expose la rémunération.';