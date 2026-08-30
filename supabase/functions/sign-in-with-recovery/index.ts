import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sha256, generateCode } from '../_shared/crypto.ts'

const allowedOrigins = [
  'https://qlfgym1-stack.github.io',
  'https://qlfgym.vercel.app',
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
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { email, code } = await req.json()

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and code are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    // Verify recovery code via RPC
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('verify_recovery_code', { p_email: email, p_code: code })

    if (rpcError) throw rpcError

    if (!rpcResult?.valid) {
      return new Response(JSON.stringify({ error: rpcResult?.error || 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const userId = rpcResult.user_id as string

    // Generate a magic link token via admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    })

    if (linkError) throw linkError

    // Extract token from action_link URL
    const actionUrl = new URL(linkData.action_link)
    const token = actionUrl.searchParams.get('token')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Failed to generate auth token' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    // Rotate recovery code (invalidate old, generate new)
    const newPlainCode = generateCode()
    const newCodeHash = await sha256(newPlainCode)

    await supabase.from('recovery_codes').upsert({
      user_id: userId,
      code_hash: newCodeHash,
      created_at: new Date().toISOString(),
      last_used_at: null,
    }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ token, newCode: newPlainCode }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    console.error('Sign-in with recovery error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
})
