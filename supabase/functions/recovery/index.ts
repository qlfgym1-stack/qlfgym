import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sha256, generateCode } from '../_shared/crypto.ts'

async function hashEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false
  const enc = new TextEncoder()
  return crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b))
}

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

    const body = await req.json()
    const { action, email, code, newPassword } = body

    if (!email) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    if (action !== 'send_code' && action !== 'verify' && action !== 'reset' && action !== 'send_email') {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    if ((action === 'verify' || action === 'reset') && !code) {
      return new Response(JSON.stringify({ error: 'Code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    // Find the user by email (paginated)
    let allUsers: any[] = []
    let page = 0
    let hasMore = true
    while (hasMore) {
      const { data, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage: 100,
      })
      if (listError) throw listError
      if (!data?.users?.length) break
      allUsers = [...allUsers, ...data.users]
      hasMore = data.users.length === 100
      page++
    }

    const user = allUsers.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const userId = user.id

    // Per-action rate limiting
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('recovery_code_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action', action)
      .eq('success', false)
      .gte('attempted_at', since)
    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    if (action === 'send_code') {
      const newPlainCode = generateCode()
      const newCodeHash = await sha256(newPlainCode)

      await supabase.from('recovery_codes').upsert({
        user_id: userId,
        code_hash: newCodeHash,
        created_at: new Date().toISOString(),
        last_used_at: null,
      })

      // Also generate a recovery link (Supabase sends email if SMTP configured)
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: email,
      })

      return new Response(JSON.stringify({
        success: true,
        newCode: newPlainCode,
        recoveryLink: linkData?.properties?.action_link || null,
        message: 'Recovery code generated. If email is configured, a recovery link has been sent.',
      }), {
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    if (action === 'verify') {
      const { data: recoveryData } = await supabase
        .from('recovery_codes')
        .select('code_hash')
        .eq('user_id', userId)
        .single()

      if (!recoveryData) {
        await supabase.from('recovery_code_logs').insert({
          user_id: userId,
          success: false,
          action: 'verify',
        })
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      const codeHash = await sha256(code.toUpperCase())
      const validHashes = await hashEqual(codeHash, recoveryData.code_hash)
      if (!validHashes) {
        await supabase.from('recovery_code_logs').insert({
          user_id: userId,
          success: false,
          action: 'verify',
        })
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      await supabase.from('recovery_code_logs').insert({
        user_id: userId,
        success: true,
        action: 'verify',
      })

      await supabase
        .from('recovery_codes')
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', userId)

      return new Response(JSON.stringify({ valid: true, userId }), {
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    if (action === 'reset') {
      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: 'Invalid password' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      // Verify code again before allowing password reset
      const { data: recoveryData } = await supabase
        .from('recovery_codes')
        .select('code_hash')
        .eq('user_id', userId)
        .single()

      if (!recoveryData) {
        await supabase.from('recovery_code_logs').insert({
          user_id: userId,
          success: false,
          action: 'reset',
        })
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      const codeHash = await sha256(code.toUpperCase())
      const validHashes = await hashEqual(codeHash, recoveryData.code_hash)
      if (!validHashes) {
        await supabase.from('recovery_code_logs').insert({
          user_id: userId,
          success: false,
          action: 'reset',
        })
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

      // Update password via Supabase Auth admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
      })
      if (updateError) throw updateError

      await supabase.from('recovery_code_logs').insert({
        user_id: userId,
        success: true,
        action: 'reset',
      })

      // Invalidate old code and generate new one
      const newPlainCode = generateCode()
      const newCodeHash = await sha256(newPlainCode)

      await supabase.from('recovery_codes').upsert({
        user_id: userId,
        code_hash: newCodeHash,
        created_at: new Date().toISOString(),
        last_used_at: null,
      })

      return new Response(JSON.stringify({
        success: true,
        newCode: newPlainCode,
      }), {
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    if (action === 'send_email') {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: email,
      })
      if (linkError) throw linkError

      return new Response(JSON.stringify({
        success: true,
        message: 'Recovery email sent if account exists',
      }), {
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    console.error('Recovery error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
})
