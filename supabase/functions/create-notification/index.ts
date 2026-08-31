import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = [
  'https://qlfgym.vercel.app',
  'https://qlfgym1-stack.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') || ''
  const corsOrigin = allowedOrigins.includes(origin) ? origin : 'null'
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, apikey',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseKey || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const jwt = authHeader.replace('Bearer ', '')
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { organization_id, user_id, type, title, message, data } = body

    if (!organization_id || !type || !title || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields: organization_id, type, title, message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const { data: roleRow, error: roleError } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .single()

    if (roleError || !roleRow || !['admin'].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required for this organization' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const validTypes = ['subscription_expiring', 'payment_overdue', 'member_checkin', 'staff_leave', 'system']
    if (!validTypes.includes(type)) {
      return new Response(JSON.stringify({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const { data: notifId, error } = await supabase.rpc('create_notification', {
      p_organization_id: organization_id,
      p_user_id: user_id || null,
      p_type: type,
      p_title: title,
      p_message: message,
      p_data: data || {},
    })

    if (error) {
      console.error('create_notification error:', error)
      return new Response(JSON.stringify({ error: 'Failed to create notification' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    return new Response(JSON.stringify({ id: notifId }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    console.error('create-notification error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
})
