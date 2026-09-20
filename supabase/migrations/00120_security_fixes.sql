-- Migration 00120: Fix search_path for SECURITY DEFINER functions + fix super_admin role
-- =============================================================================
-- 1. Fix: super_admin users must be updated to admin role
--    (migration 00059 merged super_admin into admin but existing user_roles
--     data still had 'super_admin' which is rejected by is_encaissement_operator
--     which checks role IN ('admin', 'receptionist'))
-- 2. Fix: All SECURITY DEFINER functions missing SET search_path = public
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FIX: super_admin → admin (is_encaissement_operator checks admin/receptionist)
-- ---------------------------------------------------------------------------
UPDATE public.user_roles SET role = 'admin' WHERE role = 'super_admin';

-- auto_assign_owner_role (already exists with SET search_path = public)
-- is_org_member (already exists with SET search_path = public)
-- rfid_check_in new version (already exists with SET search_path = public)
-- rfid_check_out new version (already exists with SET search_path = public)
-- phone_check_in (already exists with SET search_path = public)
-- manual_check_in new version (already exists with SET search_path = public)
-- get_staff_roster (already exists with SET search_path = public)

-- Ensure all SECURITY DEFINER functions have SET search_path = public
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

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = p_org_id
      AND ur.role != 'cleaner'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rfid_check_in(
  p_rfid_uid uuid,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_member_name text;
  v_subscription_id uuid;
  v_subscription_end_date date;
  v_now timestamptz := now();
  v_today date := CURRENT_DATE;
  v_subscription_status text;
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this organization';
  END IF;

  SELECT m.id, m.first_name || ' ' || m.last_name, m.status
  INTO v_member_id, v_member_name, v_subscription_status
  FROM members m
  JOIN rfid_cards r ON r.member_id = m.id
  WHERE r.rfid_uid = p_rfid_uid
    AND m.organization_id = p_organization_id
    AND r.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Carte RFID introuvable ou inactive');
  END IF;

  IF v_subscription_status = 'inactive' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Adhérent inactif');
  END IF;

  SELECT ms.id, ms.end_date
  INTO v_subscription_id, v_subscription_end_date
  FROM member_subscriptions ms
  WHERE ms.member_id = v_member_id
    AND ms.organization_id = p_organization_id
    AND ms.status = 'active'
    AND ms.end_date >= CURRENT_DATE
  ORDER BY ms.end_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aucun abonnement actif');
  END IF;

  INSERT INTO attendance (organization_id, member_id, check_in, type, source, created_by)
  VALUES (p_organization_id, v_member_id, now(), 'check-in', 'rfid', auth.uid());

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'member_name', v_member_name,
    'subscription_end', v_subscription_end_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rfid_check_out(
  p_rfid_uid uuid,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_member_name text;
  v_attendance_id uuid;
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this organization';
  END IF;

  SELECT m.id, m.first_name || ' ' || m.last_name
  INTO v_member_id, v_member_name
  FROM members m
  JOIN rfid_cards r ON r.member_id = m.id
  WHERE r.rfid_uid = p_rfid_uid
    AND m.organization_id = p_organization_id
    AND r.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Carte RFID introuvable ou inactive');
  END IF;

  SELECT a.id
  INTO v_attendance_id
  FROM attendance a
  WHERE a.member_id = v_member_id
    AND a.organization_id = p_organization_id
    AND a.check_out IS NULL
    AND a.check_in <= now()
  ORDER BY a.check_in DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE attendance
    SET check_out = now()
    WHERE id = v_attendance_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'member_name', v_member_name,
    'checked_out', FOUND
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_check_in(p_member_id UUID, p_org_id UUID, p_type TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_name text;
  v_subscription_id uuid;
  v_subscription_end_date date;
  v_now timestamptz := now();
  v_today date := CURRENT_DATE;
  v_subscription_status text;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of this organization';
  END IF;

  SELECT m.first_name || ' ' || m.last_name, m.status
  INTO v_member_name, v_subscription_status
  FROM members m
  WHERE m.id = p_member_id
    AND m.organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Adhérent introuvable');
  END IF;

  IF v_subscription_status = 'inactive' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Adhérent inactif');
  END IF;

  IF p_type = 'check-in' THEN
    INSERT INTO attendance (organization_id, member_id, check_in, type, source, created_by)
    VALUES (p_org_id, p_member_id, now(), 'check-in', 'manual', auth.uid());
  ELSE
    UPDATE attendance
    SET check_out = now()
    WHERE id = (
      SELECT id FROM attendance
      WHERE member_id = p_member_id AND organization_id = p_org_id
        AND check_out IS NULL
      ORDER BY check_in DESC LIMIT 1
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'member_name', v_member_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_roster(p_org_id uuid)
RETURNS SETOF staff
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_org_id
      AND role IN ('admin', 'receptionist')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT s.*
  FROM staff s
  WHERE s.organization_id = p_org_id
    AND s.is_active = true
  ORDER BY s.first_name, s.last_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rfid_check_in(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rfid_check_out(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_check_in(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_roster(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper: is_encaissement_operator — used by record_pos_checkout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_encaissement_operator(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = p_org_id
      AND ur.role IN ('admin', 'receptionist')
  )
$$;