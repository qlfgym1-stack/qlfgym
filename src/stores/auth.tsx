import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useSupabase } from '@/hooks/useSupabase'
import type { User } from '@supabase/supabase-js'
import type { Organization, UserRole } from '@/types/supabase'
import { IS_MOCK } from '@/lib/config'
import { generateRecoveryCode, storeRecoveryCode, setMockRecoveryData } from '@/lib/recovery'

interface Profile {
  id: string; email: string; full_name?: string | null; avatar_url?: string | null
}

interface AuthState {
  user: User | null; profile: Profile | null; organization: Organization | null
  roles: UserRole[]; isLoading: boolean; isAuthenticated: boolean
  authError: string | null
}

interface AuthContextValue extends AuthState {
  signIn: (identifier: string, password: string, recoveryCode?: string) => Promise<{ error: Error | null; newCode?: string }>
  signUp: (email: string, password: string, orgData: { name: string; slug: string }) => Promise<{ error: Error | null; recoveryCode?: string }>
  signOut: () => Promise<void>
  retryAuth: () => Promise<void>
}

const PROACTIVE_REFRESH_MS = 30 * 60 * 1000
const MAX_FETCH_RETRIES = 2
const MAX_REFRESH_RETRIES = 2

function isJwtError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const code = String(e.code ?? '')
  const msg = String(e.message ?? e.error_description ?? '').toLowerCase()
  return (
    code === 'PGRST301' ||
    code === '401' ||
    code === '42501' && msg.includes('jwt') ||
    msg.includes('jwt') ||
    msg.includes('expired') ||
    msg.includes('invalid_token') ||
    msg.includes('token has expired') ||
    msg.includes('permission denied') && msg.includes('token')
  )
}

function isRlsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const code = String(e.code ?? '')
  const msg = String(e.message ?? '').toLowerCase()
  return (
    code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('rls') ||
    msg.includes('row level security')
  )
}

const MOCK_ADMIN: AuthState = {
  user: { id: 'mock-admin-id', email: 'MoussaMohamedelmabrouk@gmail.com', app_metadata: {}, user_metadata: { full_name: 'Moussa Mohamed Elmabrouk' }, aud: 'authenticated', created_at: new Date().toISOString() } as any,
  profile: { id: 'mock-admin-id', email: 'MoussaMohamedelmabrouk@gmail.com', full_name: 'Moussa Mohamed Elmabrouk' },
  organization: { id: 'mock-org-id', name: 'QLF GYM', slug: 'qlf-gym', logo_url: null, address: null, phone: null, email: 'MoussaMohamedelmabrouk@gmail.com', created_at: new Date().toISOString(), coach_default_salary: 0, coach_default_rate_per_member: 0 },
  roles: [{ id: 'mock-role-id', user_id: 'mock-admin-id', organization_id: 'mock-org-id', role: 'admin', created_at: new Date().toISOString() }],
  isLoading: false, isAuthenticated: true, authError: null,
}

const initialState: AuthState = {
  user: null, profile: null, organization: null, roles: [],
  isLoading: true, isAuthenticated: false, authError: null,
}

function silentRedirectToSignIn() {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/sign-in')) {
    window.location.replace('/sign-in')
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseRef = useRef(useSupabase())
  const supabase = supabaseRef.current
  const [state, setState] = useState<AuthState>(initialState)

  const refreshLockRef = useRef(false)
  const proactiveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const tryRefreshSession = useCallback(async (retryCount = 0): Promise<boolean> => {
    if (refreshLockRef.current) return false
    refreshLockRef.current = true
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        console.warn('[Auth] refreshSession failed:', error.message)
        if (retryCount < MAX_REFRESH_RETRIES) {
          await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)))
          refreshLockRef.current = false
          return tryRefreshSession(retryCount + 1)
        }
        return false
      }
      return !!data.session
    } catch {
      if (retryCount < MAX_REFRESH_RETRIES) {
        await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)))
        refreshLockRef.current = false
        return tryRefreshSession(retryCount + 1)
      }
      return false
    } finally {
      refreshLockRef.current = false
    }
  }, [supabase])

  const fetchSession = useCallback(async (retryCount = 0, skipRefresh = false) => {
    if (IS_MOCK) { setState(MOCK_ADMIN); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setState(s => ({ ...s, isLoading: false }))
        return
      }
      const user = session.user
      const profile: Profile = { id: user.id, email: user.email ?? '', full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url }
      const { data: roles, error: rolesError } = await supabase.from('user_roles').select('*').eq('user_id', user.id)
      if (rolesError) {
        console.error('[Auth] Failed to fetch roles:', rolesError)
        if (isJwtError(rolesError) && !skipRefresh) {
          console.log('[Auth] JWT error on roles fetch, attempting refresh...')
          const refreshed = await tryRefreshSession(0)
          if (refreshed) return fetchSession(0, true)
          silentRedirectToSignIn()
          return
        }
        if (retryCount < MAX_FETCH_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
          return fetchSession(retryCount + 1, skipRefresh)
        }
        setState({ user, profile, organization: null, roles: [], isLoading: false, isAuthenticated: true, authError: 'Erreur de chargement des rôles. Rechargez la page.' })
        return
      }
      const userRoles = roles ?? []
      const orgId = userRoles[0]?.organization_id
      if (!orgId) {
        setState({ user, profile, organization: null, roles: userRoles, isLoading: false, isAuthenticated: true, authError: 'Aucune organisation associée à votre compte.' })
        return
      }
      const { data: orgData, error: orgError } = await supabase.from('organizations').select('*').eq('id', orgId).single()
      if (orgError || !orgData) {
        console.error('[Auth] Failed to fetch organization:', orgError)
        if (isJwtError(orgError) && !skipRefresh) {
          console.log('[Auth] JWT error on org fetch, attempting refresh...')
          const refreshed = await tryRefreshSession(0)
          if (refreshed) return fetchSession(0, true)
          silentRedirectToSignIn()
          return
        }
        if (retryCount < MAX_FETCH_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
          return fetchSession(retryCount + 1, skipRefresh)
        }
        setState({ user, profile, organization: null, roles: userRoles, isLoading: false, isAuthenticated: true, authError: 'Erreur de connexion au serveur. Veuillez recharger la page.' })
        return
      }
      setState({ user, profile, organization: orgData, roles: userRoles, isLoading: false, isAuthenticated: true, authError: null })
    } catch (err) {
      console.error('[Auth] Session error:', err)
      if (isJwtError(err) && !skipRefresh) {
        console.log('[Auth] JWT error in catch, attempting refresh...')
        const refreshed = await tryRefreshSession(0)
        if (refreshed) return fetchSession(0, true)
        silentRedirectToSignIn()
        return
      }
      if (retryCount < MAX_FETCH_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
        return fetchSession(retryCount + 1, skipRefresh)
      }
      setState(s => ({ ...s, isLoading: false, authError: 'Erreur de connexion. Vérifiez votre réseau et recharger la page.' }))
    }
  }, [supabase, tryRefreshSession])

  useEffect(() => {
    if (IS_MOCK) { setState(MOCK_ADMIN); return }
    fetchSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        fetchSession()
      }
    })
    proactiveTimerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        tryRefreshSession(0).then((ok) => {
          if (ok) console.log('[Auth] Proactive token refresh succeeded')
          else console.warn('[Auth] Proactive token refresh failed')
        })
      }
    }, PROACTIVE_REFRESH_MS)
    return () => {
      subscription?.unsubscribe()
      if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current)
    }
  }, [fetchSession, supabase, tryRefreshSession])

  const signIn = useCallback(async (identifier: string, password: string, recoveryCode?: string) => {
    if (IS_MOCK) { setState(MOCK_ADMIN); return { error: null } }

    if (recoveryCode) {
      if (!identifier.includes('@')) return { error: new Error('Recovery code requires an email address') }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
      const res = await fetch(`${supabaseUrl}/functions/v1/sign-in-with-recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: identifier, code: recoveryCode }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        return { error: new Error(data.error || 'Recovery sign-in failed') }
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: identifier,
        token: data.token,
        type: 'magiclink',
      })
      if (verifyError) return { error: verifyError }
      return { error: null, newCode: data.newCode }
    }

    if (identifier.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password })
      return { error }
    }

    const { error: phoneErr } = await supabase.auth.signInWithPassword({ phone: identifier, password })
    if (!phoneErr) return { error: null }

    const { data: email } = await (supabase.rpc as any)('lookup_email_by_identifier', { p_identifier: identifier })
    if (email) {
      if (email === 'INACTIVE_ACCOUNT') {
        return { error: new Error("Ce compte a été désactivé. Contactez l'administrateur.") }
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error }
    }

    return { error: phoneErr }
  }, [])

  const signUp = useCallback(async (email: string, password: string, orgData: { name: string; slug: string }) => {
    if (IS_MOCK) {
      const { plainText, hash } = await generateRecoveryCode();
      setMockRecoveryData({ userId: 'mock-admin-id', hash, created_at: new Date().toISOString(), last_used_at: null });
      setState(MOCK_ADMIN);
      return { error: null, recoveryCode: plainText };
    }
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError || !data.user) return { error: signUpError }
    let slug = orgData.slug
    let { error: orgError } = await supabase.from('organizations').insert({ name: orgData.name, slug })
    let maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (!orgError) break
      if (!orgError.message?.includes('duplicate key')) return { error: orgError }
      slug = `${orgData.slug}-${Math.random().toString(36).slice(2, 8)}`
      const result = await supabase.from('organizations').insert({ name: orgData.name, slug })
      orgError = result.error
      if (attempt === maxRetries - 1) return { error: orgError }
    }
    if (orgError) return { error: orgError }
    const { data: org } = await supabase.from('organizations').select('*').eq('slug', slug).single()
    if (!org) return { error: new Error('Failed to create organization') }
    const { plainText, hash } = await generateRecoveryCode();
    await storeRecoveryCode(data.user.id, hash);
    return { error: null, recoveryCode: plainText }
  }, [])

  const signOut = useCallback(async () => {
    try {
      if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current)
      await supabase.auth.signOut()
    } finally {
      setState(s => ({ ...s, user: null, profile: null, organization: null, roles: [], isAuthenticated: false, authError: null }))
    }
  }, [supabase])

  const retryAuth = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, authError: null }))
    const refreshed = await tryRefreshSession(0)
    if (refreshed) {
      await fetchSession(0, true)
    } else {
      await fetchSession(0, false)
    }
  }, [fetchSession, tryRefreshSession])

  const ctxValue = useMemo(() => ({ ...state, signIn, signUp, signOut, retryAuth }), [state, signIn, signUp, signOut, retryAuth])
  return <AuthContext.Provider value={ctxValue}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
