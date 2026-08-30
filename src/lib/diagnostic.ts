export type DiagnosticStatus = 'ok' | 'warning' | 'error' | 'unknown'

export interface ZoneResult {
  status: DiagnosticStatus
  label: string
  detail: string
  data?: Record<string, unknown>
}

export interface DiagnosticResult {
  diagId: string
  timestamp: string
  version: string
  build: number
  buildId: string
  environment: ZoneResult
  network: ZoneResult
  auth: ZoneResult
  supabase: ZoneResult
  storage: ZoneResult
  cache: ZoneResult
  javascript: ZoneResult
  sync: ZoneResult
  modules: ZoneResult
  cause: string
}

const MODULE_ROUTES: { key: string; path: string }[] = [
  { key: 'DASHBOARD', path: '/dashboard' },
  { key: 'MEMBERS', path: '/members' },
  { key: 'SUBSCRIPTIONS', path: '/subscriptions' },
  { key: 'PAYMENTS', path: '/payments' },
  { key: 'ENCAISSEMENT', path: '/encaissement' },
  { key: 'POS', path: '/pos' },
  { key: 'CLASSES', path: '/classes' },
  { key: 'ATTENDANCE', path: '/attendance' },
  { key: 'STAFF', path: '/staff' },
  { key: 'TIMESHEET', path: '/staff/timesheet' },
  { key: 'PLANNING', path: '/staff/planning' },
  { key: 'PRODUCTS', path: '/products' },
  { key: 'INVENTORY', path: '/inventory' },
  { key: 'CONSUMMABLES', path: '/consommables' },
  { key: 'MATERIEL', path: '/materiel' },
  { key: 'ACCESS_CONTROL', path: '/access-control' },
  { key: 'BADGES', path: '/badges' },
  { key: 'POINTAGE', path: '/pointage' },
  { key: 'COACH_MODE', path: '/coach-mode' },
  { key: 'RH', path: '/rh' },
  { key: 'EXPENSES', path: '/expenses' },
  { key: 'REPORTS', path: '/reports' },
  { key: 'CORPORATE', path: '/corporate' },
  { key: 'NOTIFICATIONS', path: '/notifications' },
  { key: 'SETTINGS', path: '/settings' },
  { key: 'USERS', path: '/admin/users' },
  { key: 'AI_ASSISTANT', path: '/ai-assistant' },
  { key: 'MEMBER_INSIGHTS', path: '/member-insights' },
]

const JS_ERRORS: string[] = []
const MAX_JS_ERRORS = 30

export function captureJsError(msg: string) {
  if (JS_ERRORS.length >= MAX_JS_ERRORS) JS_ERRORS.shift()
  JS_ERRORS.push(msg.slice(0, 100))
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    captureJsError(e.message || 'Unknown error')
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    captureJsError(typeof reason === 'string' ? reason : (reason?.message || 'Unhandled promise rejection'))
  })
}

function generateRandomHex(len: number): string {
  const chars = '0123456789ABCDEF'
  let result = ''
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * 16)]
  }
  return result
}

export function generateDiagId(): string {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  return `DIAG-${date}-${time}-${generateRandomHex(4)}`
}

function isDevHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export function checkEnvironment(): ZoneResult {
  const nav = typeof navigator !== 'undefined' ? navigator : null
  if (!nav) return { status: 'unknown', label: 'ENVIRONMENT', detail: 'No navigator' }

  const ua = nav.userAgent
  let browser = 'Unknown'
  if (ua.includes('Firefox/')) browser = 'Firefox ' + ua.split('Firefox/')[1]?.split(' ')[0]
  else if (ua.includes('Edg/')) browser = 'Edge ' + ua.split('Edg/')[1]?.split(' ')[0]
  else if (ua.includes('Chrome/')) browser = 'Chrome ' + ua.split('Chrome/')[1]?.split(' ')[0]
  else if (ua.includes('Safari/') && ua.includes('Version/')) browser = 'Safari ' + ua.split('Version/')[1]?.split(' ')[0]

  let os = 'Unknown'
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11'
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android ' + (ua.split('Android ')[1]?.split(';')[0] || '')
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

  const isPWA = typeof window !== 'undefined' && (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as any).standalone === true
  )
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const width = typeof window !== 'undefined' ? window.screen.width : 0
  const height = typeof window !== 'undefined' ? window.screen.height : 0
  const isMobile = width < 768

  const detail = `${browser} | ${os} | ${width}x${height} | ${isPWA ? 'PWA' : 'Web'} | ${isHttps ? 'HTTPS' : 'HTTP'}`

  return {
    status: 'ok',
    label: 'ENVIRONMENT',
    detail,
    data: { browser, os, width, height, isPWA, isHttps, isMobile },
  }
}

export async function checkNetwork(supabaseUrl: string): Promise<ZoneResult> {
  if (!navigator.onLine) {
    return { status: 'error', label: 'NETWORK', detail: 'Offline — no internet connection' }
  }

  const start = Date.now()
  try {
    const res = await fetch(supabaseUrl + '/rest/v1/?select=1', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    const latency = Date.now() - start
    if (res.ok || res.status === 401) {
      return {
        status: latency > 5000 ? 'warning' : 'ok',
        label: 'NETWORK',
        detail: `Connected — ${latency}ms`,
        data: { latency, status: res.status },
      }
    }
    return { status: 'warning', label: 'NETWORK', detail: `Server responded ${res.status}`, data: { status: res.status } }
  } catch {
    return { status: 'error', label: 'NETWORK', detail: 'Cannot reach server', data: { latency: Date.now() - start } }
  }
}

export function checkAuth(authState: { isAuthenticated: boolean; isLoading: boolean; user: { id: string } | null; roles: { role: string }[]; authError: string | null }): ZoneResult {
  if (authState.isLoading) {
    return { status: 'warning', label: 'AUTH', detail: 'Loading session...' }
  }
  if (authState.authError) {
    return { status: 'error', label: 'AUTH', detail: authState.authError }
  }
  if (!authState.isAuthenticated || !authState.user) {
    return { status: 'error', label: 'AUTH', detail: 'Not authenticated' }
  }
  const roleCount = authState.roles.length
  const hasAdmin = authState.roles.some(r => r.role === 'admin')
  return {
    status: 'ok',
    label: 'AUTH',
    detail: `Authenticated — ${roleCount} role(s)${hasAdmin ? ' (admin)' : ''}`,
    data: { roleCount, hasAdmin },
  }
}

export async function checkSupabase(supabase: { from: (table: string) => { select: (cols: string) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } } }): Promise<ZoneResult> {
  const start = Date.now()
  try {
    const { data, error } = await supabase.from('organizations').select('id').limit(1)
    const latency = Date.now() - start
    if (error) {
      const msg = (error as { message?: string; code?: string })?.message || 'Query failed'
      const code = (error as { code?: string })?.code || ''
      const isRls = code === '42501' || msg.includes('permission') || msg.includes('RLS')
      const isSession = code === 'PGRST301' || msg.includes('JWT') || msg.includes('expired') || msg.includes('invalid_token') || msg.includes('3') && msg.includes('token')
      if (isSession) {
        return {
          status: 'error',
          label: 'SUPABASE',
          detail: `Session expirée — reconnexion requise (${latency}ms)`,
          data: { latency, code, isSession: true },
        }
      }
      return {
        status: 'warning',
        label: 'SUPABASE',
        detail: isRls ? `RLS restriction — ${latency}ms` : `Query issue — ${latency}ms`,
        data: { latency, code, isRls },
      }
    }
    return {
      status: latency > 5000 ? 'warning' : 'ok',
      label: 'SUPABASE',
      detail: `Connected — ${latency}ms`,
      data: { latency, rowCount: Array.isArray(data) ? data.length : 0 },
    }
  } catch {
    return { status: 'error', label: 'SUPABASE', detail: 'Connection failed', data: { latency: Date.now() - start } }
  }
}

export function checkStorage(): ZoneResult {
  const results: Record<string, string> = {}
  let hasError = false

  try {
    const testKey = '_diag_test_'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)
    results['localStorage'] = 'OK'
  } catch {
    results['localStorage'] = 'ERROR'
    hasError = true
  }

  try {
    sessionStorage.setItem('_diag_test_', '1')
    sessionStorage.removeItem('_diag_test_')
    results['sessionStorage'] = 'OK'
  } catch {
    results['sessionStorage'] = 'ERROR'
    hasError = true
  }

  let indexedDbStatus = 'OK'
  if (typeof indexedDB === 'undefined') {
    indexedDbStatus = 'N/A'
  }
  results['indexedDB'] = indexedDbStatus

  let cacheApiStatus = 'OK'
  if (typeof caches === 'undefined') {
    cacheApiStatus = 'N/A'
  }
  results['cacheAPI'] = cacheApiStatus

  const fitmanagerKeys = Object.keys(localStorage).filter(k =>
    k.startsWith('FITMANAGER_') || k.startsWith('fitmanager-')
  )
  results['fitmanagerKeys'] = String(fitmanagerKeys.length)

  return {
    status: hasError ? 'error' : 'ok',
    label: 'STORAGE',
    detail: Object.entries(results).map(([k, v]) => `${k}:${v}`).join(' | '),
    data: results,
  }
}

export async function checkCache(): Promise<ZoneResult> {
  const detail = { sw: 'unknown' as string, queryCache: 'unknown' as string, offlineQueue: 0 }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      detail.sw = reg ? 'Active' : 'Not registered'
    } catch {
      detail.sw = 'Error'
    }
  } else {
    detail.sw = 'N/A'
  }

  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('FITMANAGER_QUERY_CACHE'))
    detail.queryCache = `${keys.length} cache(s)`
  } catch {
    detail.queryCache = 'Error'
  }

  try {
    const queueData = localStorage.getItem('FITMANAGER_OFFLINE_QUEUE')
    if (queueData) {
      const parsed = JSON.parse(queueData)
      detail.offlineQueue = Array.isArray(parsed) ? parsed.length : 0
    }
  } catch { /* ignore */ }

  const overall: DiagnosticStatus = detail.sw === 'Not registered' && !isDevHost() ? 'warning' : 'ok'

  return {
    status: overall,
    label: 'CACHE',
    detail: `SW: ${detail.sw}${isDevHost() && detail.sw === 'Not registered' ? ' (désactivé en dev)' : ''} | Query cache: ${detail.queryCache} | Offline queue: ${detail.offlineQueue}`,
    data: detail,
  }
}

export function checkJavaScript(): ZoneResult {
  const errorCount = JS_ERRORS.length
  if (errorCount === 0) {
    return { status: 'ok', label: 'JAVASCRIPT', detail: 'No errors captured', data: { errors: [] } }
  }
  return {
    status: 'error',
    label: 'JAVASCRIPT',
    detail: `${errorCount} error(s) captured`,
    data: { errors: [...JS_ERRORS] },
  }
}

export function checkSync(isOnline: boolean): ZoneResult {
  let queueCount = 0
  try {
    const queueData = localStorage.getItem('FITMANAGER_OFFLINE_QUEUE')
    if (queueData) {
      const parsed = JSON.parse(queueData)
      queueCount = Array.isArray(parsed) ? parsed.length : 0
    }
  } catch { /* ignore */ }

  if (!isOnline && queueCount > 0) {
    return { status: 'warning', label: 'SYNC', detail: `Offline — ${queueCount} mutation(s) queued`, data: { queueCount } }
  }
  if (queueCount > 5) {
    return { status: 'warning', label: 'SYNC', detail: `${queueCount} mutation(s) pending`, data: { queueCount } }
  }
  return { status: 'ok', label: 'SYNC', detail: isOnline ? 'Online — no pending mutations' : 'Offline — no queued mutations', data: { queueCount } }
}

export function checkModules(): ZoneResult {
  const hasRouter = typeof window !== 'undefined' && window.location.pathname !== undefined
  const moduleResults = MODULE_ROUTES.map(m => ({
    key: m.key,
    path: m.path,
    loaded: hasRouter,
  }))

  return {
    status: 'ok',
    label: 'MODULES',
    detail: `${moduleResults.length} module(s) registered`,
    data: { modules: moduleResults },
  }
}

function getWorstStatus(results: ZoneResult[]): DiagnosticStatus {
  if (results.some(r => r.status === 'error')) return 'error'
  if (results.some(r => r.status === 'warning')) return 'warning'
  return 'ok'
}

function determineCause(results: ZoneResult[]): string {
  const env = results.find(r => r.label === 'ENVIRONMENT')
  const net = results.find(r => r.label === 'NETWORK')
  const auth = results.find(r => r.label === 'AUTH')
  const supa = results.find(r => r.label === 'SUPABASE')
  const js = results.find(r => r.label === 'JAVASCRIPT')
  const cache = results.find(r => r.label === 'CACHE')
  const sync = results.find(r => r.label === 'SYNC')
  const storage = results.find(r => r.label === 'STORAGE')

  if (net?.status === 'error') return 'NETWORK_ISSUE'
  if (auth?.status === 'error') {
    const detail = auth.detail || ''
    if (detail.includes('rôle') || detail.includes('role') || detail.includes('Loading')) return 'SESSION_EXPIRED'
    return 'AUTH_ISSUE'
  }
  if (supa?.status === 'error') {
    const isSession = supa.data && (supa.data as Record<string, unknown>).isSession === true
    if (isSession) return 'SESSION_EXPIRED'
    return 'SUPABASE_ISSUE'
  }
  if (supa?.status === 'warning') return 'SUPABASE_PERMISSION_ISSUE'
  if (js?.status === 'error') return 'FRONTEND_JS_ERROR'
  if (cache?.status === 'warning') return 'CACHE_STALE'
  if (sync?.status === 'warning') return 'SYNC_ISSUE'
  if (storage?.status === 'error') return 'STORAGE_ISSUE'
  if (env?.status === 'warning') return 'ENVIRONMENT_ISSUE'
  return 'ALL_OK'
}

export async function runFullDiagnostic(opts: {
  supabaseUrl: string
  supabase: { from: (table: string) => { select: (cols: string) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } } }
  authState: { isAuthenticated: boolean; isLoading: boolean; user: { id: string } | null; roles: { role: string }[]; authError: string | null }
  isOnline: boolean
}): Promise<DiagnosticResult> {
  const [network, supabaseResult, storage, cache, sync] = await Promise.all([
    checkNetwork(opts.supabaseUrl),
    checkSupabase(opts.supabase),
    Promise.resolve(checkStorage()),
    checkCache(),
    Promise.resolve(checkSync(opts.isOnline)),
  ])

  const environment = checkEnvironment()
  const auth = checkAuth(opts.authState)
  const js = checkJavaScript()
  const modules = checkModules()

  const allResults = [environment, network, auth, supabaseResult, storage, cache, js, sync, modules]

  const versionInfo = typeof __VERSION_INFO__ !== 'undefined' ? __VERSION_INFO__ : { version: '0.0.0', build: 0, buildId: 'unknown', commitSha: 'unknown', buildDate: 'unknown', minSupportedVersion: '0.0.0' }

  return {
    diagId: generateDiagId(),
    timestamp: new Date().toISOString(),
    version: versionInfo.version,
    build: versionInfo.build,
    buildId: versionInfo.buildId,
    environment,
    network,
    auth,
    supabase: supabaseResult,
    storage,
    cache,
    javascript: js,
    sync,
    modules,
    cause: determineCause(allResults),
  }
}

const STATUS_ICON: Record<DiagnosticStatus, string> = { ok: '\u{1F7E2}', warning: '\u{1F7E1}', error: '\u{1F534}', unknown: '\u26AA' }

function statusIcon(s: DiagnosticStatus): string { return STATUS_ICON[s] || STATUS_ICON.unknown }

export function generateReport(result: DiagnosticResult): string {
  const lines = [
    'FITMANAGER PRO',
    'DIAGNOSTIC GLOBAL',
    '',
    `DIAG-ID : ${result.diagId}`,
    `VERSION : ${result.version} (${result.buildId})`,
    `DATE : ${new Date(result.timestamp).toLocaleString()}`,
    '',
    `${statusIcon(result.environment.status)} NAVIGATEUR    : ${result.environment.detail}`,
    `${statusIcon(result.network.status)} RESEAU        : ${result.network.detail}`,
    `${statusIcon(result.auth.status)} AUTH          : ${result.auth.detail}`,
    `${statusIcon(result.supabase.status)} SUPABASE      : ${result.supabase.detail}`,
    `${statusIcon(result.storage.status)} STORAGE       : ${result.storage.detail}`,
    `${statusIcon(result.cache.status)} CACHE         : ${result.cache.detail}`,
    `${statusIcon(result.javascript.status)} JAVASCRIPT    : ${result.javascript.detail}`,
    `${statusIcon(result.sync.status)} SYNCHRONISATION : ${result.sync.detail}`,
    `${statusIcon(result.modules.status)} MODULES       : ${result.modules.detail}`,
    '',
    `CAUSE PROBABLE : ${result.cause}`,
  ]

  if (result.javascript.status === 'error') {
    const errors = (result.javascript.data?.errors as string[]) || []
    if (errors.length > 0) {
      lines.push('', 'ERREURS JAVASCRIPT :')
      errors.slice(0, 5).forEach((e, i) => lines.push(`  ${i + 1}. ${e}`))
    }
  }

  return lines.join('\n')
}

export function generateCopyText(result: DiagnosticResult, description: string): string {
  return [
    'DIAG-ID : ' + result.diagId,
    '',
    'DESCRIPTION :',
    description || '(aucune description)',
    '',
    'RAPPORT :',
    generateReport(result),
  ].join('\n')
}
