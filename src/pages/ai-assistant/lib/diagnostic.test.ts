import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateDiagId,
  captureJsError,
  checkEnvironment,
  checkNetwork,
  checkAuth,
  checkSupabase,
  checkStorage,
  checkCache,
  checkJavaScript,
  checkSync,
  checkModules,
  generateReport,
  generateCopyText,
  runFullDiagnostic,
} from '@/lib/diagnostic'

function makeSupabase(data: unknown = [], error: unknown = null) {
  const limit = vi.fn().mockResolvedValue({ data, error })
  const select = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ select })
  return { from, _select: select, _limit: limit }
}

function mockLocalStorage(store: Record<string, string> = {}) {
  const get = vi.fn((k: string) => store[k] ?? null)
  const set = vi.fn((k: string, v: string) => { store[k] = v })
  const remove = vi.fn((k: string) => { delete store[k] })
  const keys = vi.fn(() => Object.keys(store))
  const obj = { getItem: get, setItem: set, removeItem: remove, length: 0, clear: vi.fn(), key: vi.fn() }
  Object.defineProperty(obj, 'length', { get: () => Object.keys(store).length })
  return obj
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

describe('generateDiagId', () => {
  it('returns DIAG-YYYYMMDD-HHMMSS-XXXX format', () => {
    const id = generateDiagId()
    expect(id).toMatch(/^DIAG-\d{8}-\d{6}-[0-9A-F]{4}$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateDiagId()))
    expect(ids.size).toBe(50)
  })
})

describe('captureJsError', () => {
  it('captures error messages', () => {
    captureJsError('diagCaptureTest1')
    captureJsError('diagCaptureTest2')
    const js = checkJavaScript()
    expect(js.detail).toContain('error')
  })

  it('truncates long messages to 100 chars', () => {
    captureJsError('diagTruncate' + 'x'.repeat(200))
    const js = checkJavaScript()
    const errors = js.data?.errors as string[]
    expect(errors.some(e => e.length === 100)).toBe(true)
  })

  it('caps at 30 errors', () => {
    for (let i = 0; i < 35; i++) captureJsError('diagOverflow-' + i)
    const js = checkJavaScript()
    const errors = js.data?.errors as string[]
    expect(errors.length).toBeLessThanOrEqual(30)
  })
})

describe('checkEnvironment', () => {
  it('returns ok with data', () => {
    const result = checkEnvironment()
    expect(result.status).toBe('ok')
    expect(result.label).toBe('ENVIRONMENT')
    expect(result.detail).toBeDefined()
    expect(result.data).toBeDefined()
    expect(result.data?.isMobile).toBeDefined()
  })
})

describe('checkNetwork', () => {
  it('returns error when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const result = await checkNetwork('https://test.supabase.co')
    expect(result.status).toBe('error')
    expect(result.detail).toContain('Offline')
    vi.unstubAllGlobals()
  })

  it('returns ok when server responds', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const result = await checkNetwork('https://test.supabase.co')
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('Connected')
    vi.unstubAllGlobals()
  })

  it('returns ok on 401 (server reachable)', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const result = await checkNetwork('https://test.supabase.co')
    expect(result.status).toBe('ok')
    vi.unstubAllGlobals()
  })

  it('returns error on fetch failure', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
    const result = await checkNetwork('https://test.supabase.co')
    expect(result.status).toBe('error')
    vi.unstubAllGlobals()
  })
})

describe('checkAuth', () => {
  it('returns warning when loading', () => {
    const result = checkAuth({ isAuthenticated: false, isLoading: true, user: null, roles: [], authError: null })
    expect(result.status).toBe('warning')
    expect(result.detail).toContain('Loading')
  })

  it('returns error on authError', () => {
    const result = checkAuth({ isAuthenticated: true, isLoading: false, user: { id: '1' }, roles: [], authError: 'Session expired' })
    expect(result.status).toBe('error')
    expect(result.detail).toBe('Session expired')
  })

  it('returns error when not authenticated', () => {
    const result = checkAuth({ isAuthenticated: false, isLoading: false, user: null, roles: [], authError: null })
    expect(result.status).toBe('error')
    expect(result.detail).toContain('Not authenticated')
  })

  it('returns ok with admin role', () => {
    const result = checkAuth({
      isAuthenticated: true, isLoading: false,
      user: { id: '1' }, roles: [{ role: 'admin' }, { role: 'staff' }],
      authError: null,
    })
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('2 role(s)')
    expect(result.detail).toContain('admin')
  })

  it('returns ok without admin role', () => {
    const result = checkAuth({
      isAuthenticated: true, isLoading: false,
      user: { id: '1' }, roles: [{ role: 'staff' }],
      authError: null,
    })
    expect(result.status).toBe('ok')
    expect(result.detail).not.toContain('(admin)')
  })
})

describe('checkSupabase', () => {
  it('returns ok on successful query', async () => {
    const mock = makeSupabase([{ id: '1' }])
    const result = await checkSupabase(mock as any)
    expect(result.status).toBe('ok')
    expect(result.data?.rowCount).toBe(1)
  })

  it('returns warning on RLS error', async () => {
    const mock = makeSupabase(null, { message: 'permission denied', code: '42501' })
    const result = await checkSupabase(mock as any)
    expect(result.status).toBe('warning')
    expect(result.detail).toContain('RLS')
  })

  it('returns error on connection failure', async () => {
    const mock = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ limit: vi.fn().mockRejectedValue(new Error('fail')) }) }) }
    const result = await checkSupabase(mock as any)
    expect(result.status).toBe('error')
    expect(result.detail).toContain('Connection failed')
  })
})

describe('checkStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage())
    vi.stubGlobal('sessionStorage', mockLocalStorage())
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('returns ok when storage works', () => {
    const result = checkStorage()
    expect(result.status).toBe('ok')
    expect(result.data?.localStorage).toBe('OK')
  })
})

describe('checkJavaScript', () => {
  it('returns a valid result with data', () => {
    const result = checkJavaScript()
    expect(result.label).toBe('JAVASCRIPT')
    expect(result.data).toBeDefined()
    expect(Array.isArray(result.data?.errors)).toBe(true)
  })
})

describe('checkSync', () => {
  it('returns ok when online with no queue', () => {
    vi.stubGlobal('localStorage', mockLocalStorage())
    const result = checkSync(true)
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('Online')
    vi.unstubAllGlobals()
  })

  it('returns warning when offline with queued mutations', () => {
    vi.stubGlobal('localStorage', mockLocalStorage({ FITMANAGER_OFFLINE_QUEUE: JSON.stringify([{ op: 'c' }, { op: 'u' }]) }))
    const result = checkSync(false)
    expect(result.status).toBe('warning')
    expect(result.detail).toContain('2 mutation')
    vi.unstubAllGlobals()
  })
})

describe('checkModules', () => {
  it('returns ok with module count', () => {
    const result = checkModules()
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('module(s)')
  })
})

describe('checkCache', () => {
  it('returns ok when SW not registered on localhost (dev)', async () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue(null) } })
    const result = await checkCache()
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('désactivé en dev')
    vi.unstubAllGlobals()
  })

  it('returns warning when SW not registered on production host', async () => {
    vi.stubGlobal('window', { location: { hostname: 'qlfgym.vercel.app' } })
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue(null) } })
    const result = await checkCache()
    expect(result.status).toBe('warning')
    vi.unstubAllGlobals()
  })
})

describe('generateReport', () => {
  it('generates a formatted report string', async () => {
    vi.stubGlobal('localStorage', mockLocalStorage())
    vi.stubGlobal('sessionStorage', mockLocalStorage())
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'Chrome/120' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const r = await runFullDiagnostic({
      supabaseUrl: 'https://test.supabase.co',
      supabase: makeSupabase([]) as any,
      authState: { isAuthenticated: true, isLoading: false, user: { id: '1' }, roles: [{ role: 'admin' }], authError: null },
      isOnline: true,
    })
    const report = generateReport(r)
    expect(report).toContain('FITMANAGER PRO')
    expect(report).toContain(r.diagId)
    expect(report).toContain('NAVIGATEUR')
    expect(report).toContain('CAUSE PROBABLE')

    vi.unstubAllGlobals()
  })
})

describe('generateCopyText', () => {
  it('includes description and report', async () => {
    vi.stubGlobal('localStorage', mockLocalStorage())
    vi.stubGlobal('sessionStorage', mockLocalStorage())
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'Chrome/120' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const r = await runFullDiagnostic({
      supabaseUrl: 'https://test.supabase.co',
      supabase: makeSupabase([]) as any,
      authState: { isAuthenticated: true, isLoading: false, user: { id: '1' }, roles: [], authError: null },
      isOnline: true,
    })
    const text = generateCopyText(r, 'Test description')
    expect(text).toContain('Test description')
    expect(text).toContain(r.diagId)

    vi.unstubAllGlobals()
  })
})

describe('runFullDiagnostic', () => {
  it('returns complete diagnostic result', async () => {
    vi.stubGlobal('localStorage', mockLocalStorage())
    vi.stubGlobal('sessionStorage', mockLocalStorage())
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'Mozilla/5.0 Chrome/120' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await runFullDiagnostic({
      supabaseUrl: 'https://test.supabase.co',
      supabase: makeSupabase([]) as any,
      authState: { isAuthenticated: true, isLoading: false, user: { id: '1' }, roles: [{ role: 'admin' }], authError: null },
      isOnline: true,
    })

    expect(result.diagId).toMatch(/^DIAG-/)
    expect(result.timestamp).toBeDefined()
    expect(result.environment.label).toBe('ENVIRONMENT')
    expect(result.network.label).toBe('NETWORK')
    expect(result.auth.label).toBe('AUTH')
    expect(result.supabase.label).toBe('SUPABASE')
    expect(result.storage.label).toBe('STORAGE')
    expect(result.cache.label).toBe('CACHE')
    expect(result.javascript.label).toBe('JAVASCRIPT')
    expect(result.sync.label).toBe('SYNC')
    expect(result.modules.label).toBe('MODULES')
    expect(result.cause).toBeDefined()

    vi.unstubAllGlobals()
  })

  it('returns valid cause when network/auth/infra are fine', async () => {
    vi.stubGlobal('localStorage', mockLocalStorage())
    vi.stubGlobal('sessionStorage', mockLocalStorage())
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'Chrome/120' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await runFullDiagnostic({
      supabaseUrl: 'https://test.supabase.co',
      supabase: makeSupabase([]) as any,
      authState: { isAuthenticated: true, isLoading: false, user: { id: '1' }, roles: [{ role: 'admin' }], authError: null },
      isOnline: true,
    })

    const validCauses = ['ALL_OK', 'FRONTEND_JS_ERROR']
    expect(validCauses).toContain(result.cause)
    vi.unstubAllGlobals()
  })
})
