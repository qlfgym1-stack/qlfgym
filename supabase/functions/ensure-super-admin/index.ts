import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = [
  'https://qlfgym1-stack.github.io',
  'https://qlfgym.vercel.app',
  'https://fitmanager-pro-dz-eight.vercel.app',
  'https://fitmanager-pro-dz.vercel.app',
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

// Sécurité : l'email du SUPER_ADMIN n'est JAMAIS en dur dans le code frontend.
// Il est configuré comme secret de l'Edge Function (SUPER_ADMIN_EMAIL) et seul
// ce compte, une fois connecté, peut déclencher l'élevation de son propre rôle.
serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(req) })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const superAdminEmail = (Deno.env.get('SUPER_ADMIN_EMAIL') || '').toLowerCase().trim()
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }
    if (!superAdminEmail) {
      return new Response(JSON.stringify({ error: 'SUPER_ADMIN_EMAIL is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    // L'appelant doit être connecté ET son email doit correspondre au compte
    // SUPER_ADMIN configuré. Personne d'autre ne peut déclencher l'assignation.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const jwt = authHeader.replace('Bearer ', '')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }
    if ((user.email || '').toLowerCase().trim() !== superAdminEmail) {
      return new Response(JSON.stringify({ error: 'Forbidden: this account is not the configured SUPER_ADMIN' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    // Assignation via RPC sécurisé (service_role requis côté BDD).
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data, error } = await supabase.rpc('assign_super_admin_role_by_email', {
      p_email: superAdminEmail,
    })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    return new Response(JSON.stringify({
      success: !data?.error,
      result: data,
    }), {
      status: data?.error ? 409 : 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    console.error('ensure-super-admin error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
})