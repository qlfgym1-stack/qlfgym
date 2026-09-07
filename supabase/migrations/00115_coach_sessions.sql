-- 00115: Séances coach datées — Coach + Membre + Date + Heure + Statut
-- =============================================================================
-- Nouvelle table `coach_sessions` : séance individuelle datée
--   coach (staff), membre, date, heure (début/fin), type, salle/lieu, statut.
--   Synchronisation : affichée dans la fiche coach (séances de ses membres)
--   et la fiche membre ; le statut alimente le suivi utilisé pour PAIE & RH.
--   Les classes (gabarits hebdo) et staff_shifts restent inchangés.
-- RLS : admin = gestion complète ; coach = gestion de SES séances ;
--       tous les membres de l'org = lecture.
-- =============================================================================

CREATE TABLE public.coach_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  session_type text,
  room text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled', 'no_show')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_sessions_org_date ON public.coach_sessions(organization_id, session_date);
CREATE INDEX idx_coach_sessions_coach_date ON public.coach_sessions(coach_id, session_date);
CREATE INDEX idx_coach_sessions_member_date ON public.coach_sessions(member_id, session_date);

ALTER TABLE public.coach_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coach_sessions" ON public.coach_sessions
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = coach_sessions.organization_id
        AND ur.role = 'admin'
    )
  );

CREATE POLICY "Coaches can manage own coach_sessions" ON public.coach_sessions
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
    AND coach_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Staff can view coach_sessions" ON public.coach_sessions
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_sessions TO authenticated;