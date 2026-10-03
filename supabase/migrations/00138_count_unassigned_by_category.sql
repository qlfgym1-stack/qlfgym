-- ============================================================================
-- 00138 — Comptage des membres NON affectés par catégorie
-- ============================================================================
-- Complète `list_coaches` (00137), qui ne compte que les membres ayant déjà un
-- coach. L'écran d'affectation a besoin des deux moitiés pour montrer le
-- reste à faire : « 47 hommes non affectés », « 6 garçons non affectés ».
--
-- Volontairement aligné sur la sémantique de `list_coaches` : membres ACTIFS
-- uniquement, sinon le total affiché ne correspondrait pas à la paie.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_unassigned_by_category(p_org_id uuid)
RETURNS TABLE (category text, member_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Les 5 catégories sont toujours renvoyées, même à zéro : l'interface peut
  -- afficher une ligne vide plutôt qu'un trou, et les tests ont 5 lignes.
  RETURN QUERY
  SELECT c.category, COALESCE(k.n, 0)::integer
  FROM (VALUES ('adult_male'),('adult_female'),('boy'),('girl'),('unknown')) AS c(category)
  LEFT JOIN LATERAL (
    SELECT count(*) AS n
      FROM public.members m
     WHERE m.organization_id = p_org_id
       AND m.coach_id IS NULL
       AND m.status = 'active'
       AND public.member_category(m.gender, m.birth_date) = c.category
  ) k ON true;
END;
$$;

COMMENT ON FUNCTION public.count_unassigned_by_category(uuid) IS
  'Effectif ACTIF sans coach, réparti sur les 5 catégories. Renvoie toujours 5 lignes.';

GRANT EXECUTE ON FUNCTION public.count_unassigned_by_category(uuid) TO authenticated, service_role;