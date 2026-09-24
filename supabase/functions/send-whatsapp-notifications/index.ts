import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = [
  'https://qlf-gym.vercel.app',
  'https://fitmanager-pro-fvh942ogp-qlfgym20-engs-projects.vercel.app',
  'https://qlfgym.vercel.app',
  'https://fitmanager-pro-dz-eight.vercel.app',
  'https://fitmanager-pro-dz.vercel.app',
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

function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.length === 12 && digits.startsWith('213')) return digits
  if (digits.length === 14 && digits.startsWith('00213')) return '213' + digits.slice(5)
  if (digits.length === 10 && digits.startsWith('0')) return '213' + digits.slice(1)
  return ''
}

function buildMessage(name: string, endDate: string, salle: string): string {
  return `Bonjour ${name}, votre abonnement expirera le ${endDate} à ${salle}. Pensez à le renouveler !`
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
    if (!supabaseUrl || !supabaseKey) {
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
    const token = authHeader.slice(7)
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data: authOk } = await supabase.rpc('is_valid_service_role', { p_token: token })
    if (!authOk) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0]

    // Get ready/queued whatsapp_outbox entries scheduled for today or earlier
    const { data: outboxEntries } = await supabase
      .from('whatsapp_outbox')
      .select('*')
      .in('status', ['ready', 'queued'])
      .lte('scheduled_for', today)
      .limit(100)

    if (!outboxEntries?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } })
    }

    let sent = 0
    for (const entry of outboxEntries) {
      const phone = entry.phone || ''
      const digits = formatWhatsAppPhone(phone)
      if (!digits) {
        // Mark as failed if no valid phone
        await supabase
          .from('whatsapp_outbox')
          .update({ status: 'failed', error: 'Invalid phone number' })
          .eq('id', entry.id)
        continue
      }

      const message = entry.message || buildMessage(
        entry.member_name || '',
        entry.scheduled_for || '',
        ''
      )
      const text = encodeURIComponent(message)
      const waUrl = `https://web.whatsapp.com/send?phone=${digits}&text=${text}`

      // Update status to sent_via_link and store the link
      await supabase
        .from('whatsapp_outbox')
        .update({
          status: 'sent_via_link',
          sent_at: new Date().toISOString(),
          message_url: waUrl,
        })
        .eq('id', entry.id)

      sent++
    }

    return new Response(JSON.stringify({ sent, processed: outboxEntries.length }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), { status: 500, headers: { ...getCorsHeaders(req) } })
  }
})
