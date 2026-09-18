import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useSupabase } from '@/hooks/useSupabase'
import type { User } from '@supabase/supabase-js'
import type { Organization, UserRole } from '@/types/supabase'
import { IS_MOCK } from '@/lib/config'
import { generateRecoveryCode, storeRecoveryCode, setMockRecoveryData } from '@/lib/recovery'
import { queryClient } from '@/lib/query-client'

interface Profile {
  id: string; email: string; full_name?: string | null; avatar_url?: string | null
}

interface AuthState {
  user: User | null; profile: Profile | null; organization: Organization | null
  roles: UserRole[]; isLoading: boolean; isAuthenticated: boolean
  authError: string | null
}

export type TopRole = 'super_admin' | 'admin' | 'coach' | 'staff' | 'receptionist' | 'cleaner' | null

const ROLE_RANK: Record<string, number> = {
  super_admin: 6, admin: 5, coach: 4, staff: 3, receptionist: 2, cleaner: 1,
}

export function topRoleOf(roles: UserRole[]): TopRole {
  if (!roles || roles.length === 0) return null
  let best: TopRole = null
  let bestRank = -1
  for (const r of roles) {
    const rank = ROLE_RANK[r.role] ?? 0
    if (rank > bestRank) { bestRank = rank; best = r.role as TopRole }
  }
  return best
}

async function getPendingMfaFactorId(supabase: import('@supabase/supabase-js').SupabaseClient<import('@/types/supabase').Database>): Promise<string | null> {
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') return null
    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const totp = (factorsData?.all ?? []).find(f => f.status === 'verified' && f.factor_type === 'totp')
    return totp?.id ?? null
  } catch {
    return null
  }
}

interface AuthContextValue extends AuthState {
  signIn: (identifier: string, password: string, recoveryCode?: string) => Promise<{ error: Error | null; newCode?: string }>
  signUp: (email: string, password: string, orgData: { name: string; slug: string }) => Promise<{ error: Error | null; recoveryCode?: string }>
  signOut: () => Promise<void>
  retryAuth: () => Promise<void>
  topRole: TopRole
  isSuperAdmin: boolean
  sendOtp: (email: string) => Promise<{ error: Error | null }>
  verifyOtpCode: (email: string, token: string) => Promise<{ error: Error | null; requiresMfa?: boolean; factorId?: string }>
  signInWithProvider: (provider: 'google' | 'apple') => Promise<{ error: Error | null }>
  prepareMfa: () => Promise<{ error: Error | null; factorId?: string | null }>
  verifyMfa: (factorId: string, code: string) => Promise<{ error: Error | null }>
  enrollTOTP: () => Promise<{ error: Error | null; factorId?: string; qrCode?: string }>
  verifyTOTPEnroll: (factorId: string, code: string) => Promise<{ error: Error | null }>
  unenrollMFA: (factorId: string) => Promise<{ error: Error | null }>
  listMfa: () => Promise<{ error: Error | null; factors?: Array<{ id: string; status: string; type: string; friendlyName?: string | null }> }>
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
  organization: { id: 'mock-org-id', name: 'Fitmanager Pro Dz', slug: 'qlf-gym', logo_url: null, address: null, phone: null, email: 'MoussaMohamedelmabrouk@gmail.com', created_at: new Date().toISOString(), coach_default_salary: 0, coach_default_rate_per_member: 0 },
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
  const fetchSeqRef = useRef(0)

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
    fetchSeqRef.current++
    const seq = fetchSeqRef.current
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        if (fetchSeqRef.current !== seq) return
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
        if (fetchSeqRef.current !== seq) return
        setState({ user, profile, organization: null, roles: [], isLoading: false, isAuthenticated: false, authError: 'Erreur de chargement des rôles. Rechargez la page.' })
        return
      }
      const userRoles = roles ?? []
      const orgId = userRoles[0]?.organization_id
      if (!orgId) {
        if (fetchSeqRef.current !== seq) return
        setState({ user, profile, organization: null, roles: userRoles, isLoading: false, isAuthenticated: false, authError: 'Aucune organisation associée à votre compte.' })
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
        if (fetchSeqRef.current !== seq) return
        setState({ user, profile, organization: null, roles: userRoles, isLoading: false, isAuthenticated: false, authError: 'Erreur de connexion au serveur. Veuillez recharger la page.' })
        return
      }
      if (fetchSeqRef.current !== seq) return
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
      if (fetchSeqRef.current !== seq) return
      setState(s => ({ ...s, isLoading: false, isAuthenticated: false, authError: 'Erreur de connexion. Vérifiez votre réseau et recharger la page.' }))
    }
  }, [supabase, tryRefreshSession])

  useEffect(() => {
    if (IS_MOCK) { setState(MOCK_ADMIN); return }
    fetchSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
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
  }, [supabase])

  const sendOtp = useCallback(async (email: string) => {
    if (IS_MOCK) return { error: null }
    if (!email.includes('@')) return { error: new Error('Adresse email invalide') }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (error && String(error.message || '').toLowerCase().includes('otp_disabled')) {
      return { error: new Error('La connexion par code email (OTP) n\'est pas activée sur ce projet. Vous pouvez utiliser votre email + mot de passe, ou bien activer "Email OTP" dans Supabase → Authentication.') }
    }
    return { error }
  }, [supabase])

  const verifyOtpCode = useCallback(async (email: string, token: string) => {
    if (IS_MOCK) return { error: null }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) return { error }
    const factorId = await getPendingMfaFactorId(supabase)
    return { error: null, requiresMfa: !!factorId, factorId: factorId ?? undefined }
  }, [supabase])

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    if (IS_MOCK) return { error: null }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + '/auth/callback' },
    })
    return { error }
  }, [supabase])

  const prepareMfa = useCallback(async () => {
    if (IS_MOCK) return { error: null, factorId: null }
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError) return { error: aalError }
    if (aal.currentLevel === 'aal2') return { error: null, factorId: null }
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError) return { error: factorsError }
    const totp = (factorsData?.all ?? []).find(f => f.status === 'verified' && f.factor_type === 'totp')
    return { error: null, factorId: totp?.id ?? null }
  }, [supabase])

  const verifyMfa = useCallback(async (factorId: string, code: string) => {
    if (IS_MOCK) return { error: null }
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) return { error: challengeError }
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.replace(/\s/g, '') })
      if (verifyError) return { error: verifyError }
      fetchSession(0, true)
      return { error: null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) }
    }
  }, [supabase, fetchSession])

  const enrollTOTP = useCallback(async () => {
    if (IS_MOCK) return { error: null }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' })
    if (error) return { error }
    return { error: null, factorId: data.id, qrCode: data.totp?.qr_code }
  }, [supabase])

  const verifyTOTPEnroll = useCallback(async (factorId: string, code: string) => {
    if (IS_MOCK) return { error: null }
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) return { error: challengeError }
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.replace(/\s/g, '') })
      if (verifyError) return { error: verifyError }
      return { error: null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) }
    }
  }, [supabase])

  const unenrollMFA = useCallback(async (factorId: string) => {
    if (IS_MOCK) return { error: null }
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    return { error }
  }, [supabase])

  const listMfa = useCallback(async () => {
    if (IS_MOCK) return { error: null, factors: [] }
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) return { error }
    const factors = (data?.all ?? []).map(f => ({
      id: f.id, status: f.status, type: f.factor_type,
      friendlyName: f.friendly_name ?? null,
    }))
    return { error: null, factors }
  }, [supabase])

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
  }, [supabase])

  const signOut = useCallback(async () => {
    try {
      if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current)
      await supabase.auth.signOut()
      queryClient.clear()
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

  const topRole = topRoleOf(state.roles)
  const isSuperAdmin = topRole === 'super_admin'

  const ctxValue = useMemo(() => ({
    ...state,
    signIn, signUp, signOut, retryAuth,
    topRole, isSuperAdmin,
    sendOtp, verifyOtpCode, signInWithProvider,
    prepareMfa, verifyMfa,
    enrollTOTP, verifyTOTPEnroll, unenrollMFA, listMfa,
  }), [state, signIn, signUp, signOut, retryAuth, topRole, isSuperAdmin,
    sendOtp, verifyOtpCode, signInWithProvider, prepareMfa, verifyMfa,
    enrollTOTP, verifyTOTPEnroll, unenrollMFA, listMfa])

  return <AuthContext.Provider value={ctxValue}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
