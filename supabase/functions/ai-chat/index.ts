import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = [
  'https://qlfgym.vercel.app',
  'https://fitmanager-pro-dz-eight.vercel.app',
  'https://fitmanager-pro-dz.vercel.app',
  'https://fitmanager-pro-gwd4r76cw-qlfgym20-engs-projects.vercel.app',
  'https://qlfgym1-stack.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
]

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Modèles gratuits OpenRouter (prompt = 0, completion = 0), vérifiés via l'API.
const FREE_MODELS = [
  'cohere/north-mini-code:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'inclusionai/ling-3.0-tiny:free',
  'nvidia/nemotron-3.5-content-safety:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'openai/gpt-oss-20b:free',
  'poolside/laguna-s-2.1:free',
  'poolside/laguna-xs-2.1:free',
]

const FREE_CODING = 'openai/gpt-oss-20b:free'
const FREE_REASONING = 'openai/gpt-oss-20b:free'
const FREE_MULTILINGUAL = 'google/gemma-4-26b-a4b-it:free'
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function isFreeModel(id: string): boolean {
  return FREE_MODELS.includes(id)
}

function pickFreeModel(prompt: string): string {
  const text = prompt.toLowerCase()
  const coding = ['code', 'coder', 'programme', 'programmation', 'bug', 'javascript', 'typescript', 'script', 'api', 'regex', 'sql']
  if (coding.some((kw) => text.includes(kw))) return FREE_CODING

  const reasoning = ['analyse', 'analysez', 'explique', 'expliquez', 'pourquoi', 'comment ameliorer', 'tendance', 'prevision', 'strategie', 'comparer']
  if (reasoning.some((kw) => text.includes(kw))) return FREE_REASONING

  const hasArabic = /[\u0600-\u06FF]/.test(prompt)
  if (hasArabic) return FREE_MULTILINGUAL

  return DEFAULT_MODEL
}

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

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, getCorsHeaders(req))
  }

  const cors = getCorsHeaders(req)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const openrouterKeys = [
      Deno.env.get('OPENROUTER_API_KEY'),
      Deno.env.get('OPENROUTER_API_KEY_BACKUP'),
    ].filter((k): k is string => typeof k === 'string' && k.length > 0)
    if (!supabaseUrl || !supabaseAnonKey || openrouterKeys.length === 0) {
      return json({ error: 'Server configuration error' }, 500, cors)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid Authorization header' }, 401, cors)
    }

    const jwt = authHeader.replace('Bearer ', '')
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Invalid or expired token' }, 401, cors)
    }

    let body: { messages?: ChatMessage[]; context?: string; model?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, cors)
    }

    const { messages, context, model } = body
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages array is required' }, 400, cors)
    }
    if (messages.some((m) => !m || typeof m.role !== 'string' || typeof m.content !== 'string')) {
      return json({ error: 'Each message must have role and content strings' }, 400, cors)
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const prompt = lastUser ? lastUser.content : ''
    const selectedModel = model && isFreeModel(model) ? model : pickFreeModel(prompt)

    // Candidats à essayer : modèle sélectionné en premier, puis les 2 premiers
    // modèles de secours uniquement (on borne la latence : réponse visée 5-6 s).
    const candidates = [selectedModel, ...FREE_MODELS.filter((m) => m !== selectedModel)].slice(0, 3)

    const systemContent = context
      ? `Tu es l'assistant IA de gestion d'une salle de sport (QLF GYM). Utilise le contexte de données fourni pour répondre en français, de façon concise et actionnable.\n\nContexte de données:\n${context}`
      : `Tu es l'assistant IA de gestion d'une salle de sport (QLF GYM). Réponds en français, de façon concise et actionnable.`

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...messages,
    ]

    let lastStatus = 0
    let lastText = ''
    let lastModel = ''
    let tried = 0
    let unauthorized = false

    for (const key of openrouterKeys) {
      for (const candidate of candidates) {
        lastModel = candidate
        tried += 1
        let response: Response
        try {
          response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'HTTP-Referer': 'https://fitmanager-pro-dz-eight.vercel.app',
              'X-Title': 'QLF GYM',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: candidate,
              messages: fullMessages,
              max_tokens: 200,
              temperature: 0.3,
            }),
            signal: AbortSignal.timeout(15000),
          })
        } catch (fetchErr) {
          // Timeout / réseau : on tente le modèle suivant.
          lastStatus = 0
          lastText = `network error: ${(fetchErr as Error).message}`
          continue
        }

        if (response.ok) {
          const data = await response.json()
          const content = data?.choices?.[0]?.message?.content ?? null
          if (content) {
            return json({ content, model: candidate }, 200, cors)
          }
          lastStatus = 502
          lastText = 'empty AI response'
          continue
        }

        lastStatus = response.status
        lastText = await response.text()

        // 401/403 → clé API invalide : bascule sur la clé de secours s'il en reste.
        if (response.status === 401 || response.status === 403) {
          unauthorized = true
          break
        }
        // Les autres erreurs (404 modèle retiré, 429 débit, 4xx/5xx provider) → on
        // tente le modèle suivant de la whitelist.
      }
      if (!unauthorized) break
      unauthorized = false
    }

    console.error('OpenRouter error:', lastStatus, lastModel, lastText)
    const details = tried > 1
      ? `${lastText} (modèles essayés: ${tried})`
      : lastText
    return json({ error: 'AI provider error', status: lastStatus, details, model: lastModel }, 502, cors)
  } catch (err) {
    console.error('ai-chat error:', err)
    return json({ error: 'Internal server error', details: err.message }, 500, cors)
  }
})
