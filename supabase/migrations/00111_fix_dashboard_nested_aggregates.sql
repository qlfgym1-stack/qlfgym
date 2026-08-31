-- Fix: get_dashboard_stats had nested aggregates (jsonb_agg(SUM(...)) and jsonb_agg(COUNT(...)))
-- which are forbidden in PostgreSQL (error 42803).
-- The revenue_trend and growth_trend subqueries now wrap in an inner subquery.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND organization_id = p_organization_id
    AND role IN ('admin', 'staff', 'coach')
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this organization';
  END IF;

  SELECT jsonb_build_object(
    'total_members', (SELECT COUNT(*) FROM members WHERE organization_id = p_organization_id),
    'active_members', (SELECT COUNT(*) FROM members WHERE organization_id = p_organization_id AND status = 'active'),
    'inactive_members', (SELECT COUNT(*) FROM members WHERE organization_id = p_organization_id AND status = 'inactive'),
    'total_classes', (SELECT COUNT(*) FROM classes WHERE organization_id = p_organization_id),
    'today_checkins', (SELECT COUNT(*) FROM attendance WHERE organization_id = p_organization_id AND check_in::date = CURRENT_DATE),
    'monthly_revenue', COALESCE((SELECT SUM(amount) FROM payments WHERE organization_id = p_organization_id AND status = 'completed' AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)), 0),
    'last_month_revenue', COALESCE((SELECT SUM(amount) FROM payments WHERE organization_id = p_organization_id AND status = 'completed' AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')), 0),
    'expiring_subscriptions', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT ms.id, ms.end_date, ms.status,
               m.first_name || ' ' || m.last_name AS member_name,
               st.name AS type_name
        FROM member_subscriptions ms
        JOIN members m ON m.id = ms.member_id
        JOIN subscription_types st ON st.id = ms.subscription_type_id
        WHERE ms.organization_id = p_organization_id
          AND ms.status = 'active'
          AND ms.end_date <= CURRENT_DATE + INTERVAL '30 days'
        ORDER BY ms.end_date ASC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'recent_payments', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT p.id, p.amount, p.payment_date, p.payment_method, p.status,
               m.first_name || ' ' || m.last_name AS member_name
        FROM payments p
        JOIN members m ON m.id = p.member_id
        WHERE p.organization_id = p_organization_id
        ORDER BY p.payment_date DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'revenue_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(sub.d, 'Mon'), 'amount', sub.monthly_amount))
      FROM (
        SELECT d, COALESCE(SUM(p.amount), 0) AS monthly_amount
        FROM generate_series(CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE, '1 month') d
        LEFT JOIN payments p ON DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', d)
          AND p.organization_id = p_organization_id
          AND p.status = 'completed'
        GROUP BY d ORDER BY d
      ) sub
    ), '[]'::jsonb),
    'growth_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(sub.d, 'Mon'), 'count', sub.member_count))
      FROM (
        SELECT d, COUNT(m.id) AS member_count
        FROM generate_series(CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE, '1 month') d
        LEFT JOIN members m ON DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', d)
          AND m.organization_id = p_organization_id
        GROUP BY d ORDER BY d
      ) sub
    ), '[]'::jsonb),
    'gender_data', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', g.gender, 'value', g.cnt, 'color', CASE WHEN g.gender = 'Male' THEN '#3b82f6' ELSE '#ec4899' END))
      FROM (
        SELECT CASE
                 WHEN LOWER(gender) IN ('male', 'm') THEN 'Male'
                 WHEN LOWER(gender) IN ('female', 'f') THEN 'Female'
                 ELSE 'Other'
               END AS gender,
               COUNT(*) AS cnt
        FROM members
        WHERE organization_id = p_organization_id
        GROUP BY 1
      ) g
      WHERE g.gender IN ('Male', 'Female') AND g.cnt > 0
    ), '[]'::jsonb),
    'recent_activity', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT * FROM (
          SELECT 'a-' || a.id AS id, 'Check-in' AS action,
                 m.first_name || ' ' || m.last_name AS member,
                 a.check_in AS "timestamp", 'log-in' AS icon
          FROM attendance a
          JOIN members m ON m.id = a.member_id
          WHERE a.organization_id = p_organization_id
          UNION ALL
          SELECT 'p-' || p.id AS id, 'Payment received' AS action,
                 m.first_name || ' ' || m.last_name AS member,
                 p.payment_date AS "timestamp", 'dollar' AS icon
          FROM payments p
          JOIN members m ON m.id = p.member_id
          WHERE p.organization_id = p_organization_id
        ) sub ORDER BY "timestamp" DESC LIMIT 10
      ) t
    ), '[]'::jsonb),
    'top_coaches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.first_name || ' ' || s.last_name, 'classes', cc.cnt, 'specialty', 'Staff'))
      FROM (
        SELECT coach_id, COUNT(id) AS cnt
        FROM classes
        WHERE organization_id = p_organization_id AND coach_id IS NOT NULL
        GROUP BY coach_id
        ORDER BY cnt DESC
        LIMIT 5
      ) cc
      JOIN staff s ON s.id = cc.coach_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
