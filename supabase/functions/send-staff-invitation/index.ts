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
      status: 405, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseKey || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const jwt = authHeader.replace('Bearer ', '')
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const body = await req.json()
    const { email, role, organization_id } = body
    if (!email || !role || !organization_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, role, organization_id' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const { data: roleRow, error: roleError } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .single()

    if (roleError || !roleRow || !['admin'].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = crypto.randomUUID()
    const { data: invitation, error } = await supabase
      .from('staff_invitations')
      .insert({ email, role, organization_id, token, invited_by: user.id })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to create invitation', details: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const inviteUrl = `${supabaseUrl}/auth/v1/verify?token=${token}&type=invite&redirect_to=${encodeURIComponent('/auth/accept-invite')}`

    return new Response(JSON.stringify({
      invitation,
      invite_url: inviteUrl,
      message: `Invitation sent to ${email}. In production, an email would be sent.`,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
})
