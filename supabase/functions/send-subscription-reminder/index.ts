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

const DELAYS = [5, 1]

function templateForStatus(status: string | null | undefined): string {
  if (status === 'pending_payment') return 'renewal'
  return 'renewal'
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

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getDateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function sendWhatsAppMsg(phone: string, message: string, supabase: ReturnType<typeof createClient>): boolean {
  const digits = formatWhatsAppPhone(phone)
  if (!digits) return false
  const text = encodeURIComponent(message)
  const url = `https://web.whatsapp.com/send?phone=${digits}&text=${text}`
  // For server-side: we open the WhatsApp Web link and store it in outbox
  // The user clicks the link from their browser to send
  return true
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

    const today = getToday()
    const allExpiringSubs: any[] = []

    for (const delay of DELAYS) {
      const targetDate = getDateOffset(delay)
      const { data: subs } = await supabase
        .from('member_subscriptions')
        .select(`
          *,
          members!inner(first_name, last_name, email, phone, organization_id),
          subscription_types!inner(name)
        `)
        .in('status', ['active', 'pending_payment'])
        .eq('end_date', targetDate)
        .gte('end_date', targetDate)

      if (subs?.length) {
        for (const sub of subs) {
          // Check if notification already sent for this subscription today
          const { data: existing } = await supabase
            .from('notifications')
            .select('id')
            .eq('type', 'subscription_expiring')
            .eq('created_at', today)
            .contains('data', { member_subscription_id: sub.id })
          if (existing?.length) continue

          const delayDays = delay
          const isJ5 = delay === 5
          const isJ1 = delay === 1

          allExpiringSubs.push({
            ...sub,
            _delay: delay,
            _isJ5: isJ5,
            _isJ1: isJ1,
            _endDate: targetDate,
          })
        }
      }
    }

    if (!allExpiringSubs.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } })
    }

    const orgIds = [...new Set(allExpiringSubs.map((sub: any) => sub.members.organization_id))]
    const { data: orgUsers } = await supabase
      .from('user_roles')
      .select('user_id, organization_id')
      .in('organization_id', orgIds)

    const usersByOrg: Record<string, string[]> = {}
    for (const role of orgUsers ?? []) {
      if (!usersByOrg[role.organization_id]) usersByOrg[role.organization_id] = []
      usersByOrg[role.organization_id].push(role.user_id)
    }

    const notifications: any[] = []
    const whatsappOutbox: any[] = []

    for (const sub of allExpiringSubs) {
      const delayLabel = sub._delay === 5 ? 'J-5' : 'J-1'
      const message = buildMessage(
        sub.members.first_name,
        sub._endDate,
        sub.subscription_types?.name || ''
      )
      const phone = sub.members.phone

      for (const userId of usersByOrg[sub.members.organization_id] ?? []) {
        notifications.push({
          organization_id: sub.members.organization_id,
          user_id: userId,
          title: `Abonnement expire ${delayLabel}`,
          message: `L'abonnement de ${sub.members.first_name} ${sub.members.last_name} expire le ${sub._endDate}`,
          type: 'subscription_expiring',
          data: { member_subscription_id: sub.id, member_id: sub.member_id, delay: sub._delay },
        })
      }

      // Create whatsapp_outbox entry if member has a phone
      if (phone) {
        whatsappOutbox.push({
          organization_id: sub.members.organization_id,
          member_id: sub.member_id,
          member_name: `${sub.members.first_name} ${sub.members.last_name}`,
          phone: phone,
          template_key: 'renewal',
          message: message,
          status: 'ready',
          scheduled_for: sub._endDate,
          delay_label: delayLabel,
        })
      }
    }

    // Deduplicate notifications
    const { data: existing } = await supabase
      .from('notifications')
      .select('data')
      .eq('type', 'subscription_expiring')
      .gte('created_at', today)
    const existingIds = new Set(
      (existing ?? []).map((n: any) => n.data?.member_subscription_id).filter(Boolean)
    )
    const uniqueNotifications = notifications.filter(
      (n: any) => !existingIds.has(n.data.member_subscription_id)
    )

    // Insert notifications
    if (uniqueNotifications.length) {
      const { error: notifError } = await supabase.from('notifications').insert(uniqueNotifications)
      if (notifError) console.error('Notifications insert error:', notifError)
    }

    // Insert whatsapp_outbox
    if (whatsappOutbox.length) {
      const { error: outboxError } = await supabase.from('whatsapp_outbox').insert(whatsappOutbox)
      if (outboxError) console.error('Outbox insert error:', outboxError)
    }

    return new Response(JSON.stringify({ sent: uniqueNotifications.length, whatsapp: whatsappOutbox.length }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), { status: 500, headers: { ...getCorsHeaders(req) } })
  }
})
