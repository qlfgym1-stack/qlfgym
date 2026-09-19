import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useT } from '@/i18n'
import { AppLayout } from '@/components/layout'
import { AuthProvider } from '@/stores/auth'
import { useAuth } from '@/stores/auth'
import { lazy, Suspense, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ShieldCheck } from 'lucide-react'

const SignIn = lazy(() => import('@/pages/auth/sign-in'))
const SignUp = lazy(() => import('@/pages/auth/sign-up'))
const Recovery = lazy(() => import('@/pages/auth/recovery'))
const Dashboard = lazy(() => import('@/pages/dashboard/dashboard'))
const Members = lazy(() => import('@/pages/members/members'))
const Subscriptions = lazy(() => import('@/pages/subscriptions/subscriptions'))
const Payments = lazy(() => import('@/pages/payments/payments'))
const Encaissement = lazy(() => import('@/pages/encaissement/encaissement'))
const Classes = lazy(() => import('@/pages/classes/classes'))
const Attendance = lazy(() => import('@/pages/attendance/attendance'))
const Staff = lazy(() => import('@/pages/staff/staff'))
const StaffTimesheet = lazy(() => import('@/pages/staff/timesheet'))
const StaffLeaves = lazy(() => import('@/pages/staff/leaves'))
const StaffPlanning = lazy(() => import('@/pages/staff/planning'))
const POS = lazy(() => import('@/pages/pos/pos'))
const Materiel = lazy(() => import('@/pages/materiel/materiel'))
const Consommables = lazy(() => import('@/pages/consommables/consommables'))
const Inventory = lazy(() => import('@/pages/inventory/inventory'))
const Products = lazy(() => import('@/pages/products/products'))

const AccessControl = lazy(() => import('@/pages/access-control/access-control'))
const Badges = lazy(() => import('@/pages/badges/badges'))
const Pointage = lazy(() => import('@/pages/pointage/pointage'))

const MemberPortal = lazy(() => import('@/pages/member-portal/portal'))
const CoachMode = lazy(() => import('@/pages/coach-mode/coach-mode'))
const CoachPortal = lazy(() => import('@/pages/coach-portal/coach-portal'))
const Rh = lazy(() => import('@/pages/rh/rh'))
const Reports = lazy(() => import('@/pages/reports/reports'))
const Corporate = lazy(() => import('@/pages/corporate/corporate'))
const Notifications = lazy(() => import('@/pages/notifications/notifications'))
const Settings = lazy(() => import('@/pages/settings/settings'))
const Profile = lazy(() => import('@/pages/settings/profile'))
const Diagnostics = lazy(() => import('@/pages/settings/diagnostics'))
const Security = lazy(() => import('@/pages/settings/security'))
const AdminUsers = lazy(() => import('@/pages/admin/users'))
const Audit = lazy(() => import('@/pages/admin/audit'))
const Display = lazy(() => import('@/pages/display/display'))
const Expenses = lazy(() => import('@/pages/expenses/expenses'))
const AssistantComptable = lazy(() => import('@/pages/assistant-comptable/assistant-comptable'))
const Rentabilite = lazy(() => import('@/pages/rentabilite/rentabilite'))
const AiAssistant = lazy(() => import('@/pages/ai-assistant/ai-assistant'))
const MemberInsights = lazy(() => import('@/pages/member-insights/member-insights'))
const Install = lazy(() => import('@/pages/install/install'))

function Loading() {
  return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
}

function NotFound() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <p className="text-lg text-muted-foreground">Page not found</p>
        <Button onClick={() => window.history.back()}>Go back</Button>
      </div>
    </div>
  )
}

import { AiChatProvider } from "@/stores/ai-chat"
import { OfflineBanner } from '@/components/ui/offline-banner'

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <Loading />
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  return <>{children}</>
}

// Rôles à accès restreint : réception → /pointage, /members, /pos, /encaissement ; ménage → /pointage uniquement
const RECEPTION_ROUTES = new Set(['/pointage', '/members', '/pos', '/encaissement'])
const CLEANER_ROUTES = new Set(['/pointage'])

function isRestricted(role: string, allowed: Set<string>, pathname: string, roles: { role: string }[]) {
  if (roles.some(r => ['admin', 'staff', 'coach', 'super_admin'].includes(r.role))) return false
  return roles.some(r => r.role === role) && !allowed.has(pathname)
}

function RoleGuard({ children }: { children: React.ReactNode }) {
  const { roles } = useAuth()
  const location = useLocation()
  if (isRestricted('receptionist', RECEPTION_ROUTES, location.pathname, roles)
    || isRestricted('cleaner', CLEANER_ROUTES, location.pathname, roles)) {
    return <Navigate to="/pointage" replace />
  }
  return <>{children}</>
}

function isRestrictedRole(roles: { role: string }[]) {
  if (roles.some(r => ['admin', 'staff', 'coach', 'super_admin'].includes(r.role))) return false
  return roles.some(r => r.role === 'receptionist') || roles.some(r => r.role === 'cleaner')
}

function IndexRedirect() {
  const { roles } = useAuth()
  const dest = isRestrictedRole(roles) ? '/pointage' : '/dashboard'
  return <Navigate to={dest} replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, roles } = useAuth()
  if (isLoading) return <Loading />
  if (isAuthenticated) return <Navigate to={isRestrictedRole(roles) ? '/pointage' : '/dashboard'} replace />
  return <>{children}</>
}

// Reçoit le retour OAuth (Google) : les tokens sont extraits par supabase-js
// depuis le hash de l'URL via onAuthStateChange (INITIAL_SESSION).
// Si un TOTP vérifié est actif (aal1), on demande le code Authenticator avant de continuer.
function OAuthCallback() {
  const { isLoading, roles, prepareMfa, verifyMfa } = useAuth()
  const t = useT()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (isLoading) return
      const { factorId: fid, error: e } = await prepareMfa()
      if (cancelled) return
      if (e) { setError(e.message); return }
      if (fid) setFactorId(fid)
    })()
    return () => { cancelled = true }
  }, [isLoading, prepareMfa])

  if (isLoading) return <Loading />
  if (factorId) {
    async function submit() {
      if (mfaCode.length < 6) return
      setBusy(true)
      const { error: e } = await verifyMfa(factorId!, mfaCode)
      setBusy(false)
      if (e) { setError(e.message); return }
      window.location.assign('/dashboard')
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-2 text-lg font-semibold">{t('auth.mfaTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('auth.mfaDescription')}</p>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder={t('auth.mfaCodePlaceholder')}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            className="h-12 text-center font-mono text-lg tracking-widest"
            autoFocus
          />
          <Button className="w-full h-11" onClick={submit} disabled={busy || mfaCode.length < 6}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('auth.mfaVerify')}
          </Button>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => { window.location.assign('/auth') }}>{t('auth.backToOther')}</Button>
      </div>
    )
  }
  return <Navigate to={isRestrictedRole(roles) ? '/pointage' : '/dashboard'} replace />
}

export default function App() {
  const location = useLocation()

  return (
    <AuthProvider>
      <OfflineBanner />
      <ErrorBoundary>
        <AnimatePresence mode="wait">
          <AiChatProvider>
            <Routes location={location} key={location.pathname}>
            <Route path="/auth" element={<PublicRoute><Suspense fallback={<Loading />}><SignIn /></Suspense></PublicRoute>} />
            <Route path="/auth/sign-up" element={<PublicRoute><Suspense fallback={<Loading />}><SignUp /></Suspense></PublicRoute>} />
            <Route path="/auth/recovery" element={<PublicRoute><Suspense fallback={<Loading />}><Recovery /></Suspense></PublicRoute>} />
            <Route path="/auth/callback" element={<OAuthCallback />} />
            <Route path="/" element={<ProtectedRoute><RoleGuard><AppLayout /></RoleGuard></ProtectedRoute>}>
              <Route index element={<IndexRedirect />} />
              <Route path="dashboard" element={<PageTransition><Suspense fallback={<Loading />}><Dashboard /></Suspense></PageTransition>} />
              <Route path="pointage" element={<PageTransition><Suspense fallback={<Loading />}><Pointage /></Suspense></PageTransition>} />
              <Route path="members" element={<PageTransition><Suspense fallback={<Loading />}><Members /></Suspense></PageTransition>} />
              <Route path="subscriptions" element={<PageTransition><Suspense fallback={<Loading />}><Subscriptions /></Suspense></PageTransition>} />
              <Route path="payments" element={<PageTransition><Suspense fallback={<Loading />}><Payments /></Suspense></PageTransition>} />
              <Route path="encaissement" element={<PageTransition><Suspense fallback={<Loading />}><Encaissement /></Suspense></PageTransition>} />
              <Route path="classes" element={<PageTransition><Suspense fallback={<Loading />}><Classes /></Suspense></PageTransition>} />
              <Route path="attendance" element={<PageTransition><Suspense fallback={<Loading />}><Attendance /></Suspense></PageTransition>} />
              <Route path="staff" element={<PageTransition><Suspense fallback={<Loading />}><Staff /></Suspense></PageTransition>} />
              <Route path="staff/timesheet" element={<PageTransition><Suspense fallback={<Loading />}><StaffTimesheet /></Suspense></PageTransition>} />
              <Route path="staff/leaves" element={<PageTransition><Suspense fallback={<Loading />}><StaffLeaves /></Suspense></PageTransition>} />
              <Route path="staff/planning" element={<PageTransition><Suspense fallback={<Loading />}><StaffPlanning /></Suspense></PageTransition>} />
              <Route path="pos" element={<PageTransition><Suspense fallback={<Loading />}><POS /></Suspense></PageTransition>} />
              <Route path="materiel" element={<PageTransition><Suspense fallback={<Loading />}><Materiel /></Suspense></PageTransition>} />
              <Route path="consommables" element={<PageTransition><Suspense fallback={<Loading />}><Consommables /></Suspense></PageTransition>} />
              <Route path="inventory" element={<PageTransition><Suspense fallback={<Loading />}><Inventory /></Suspense></PageTransition>} />
              <Route path="products" element={<PageTransition><Suspense fallback={<Loading />}><Products /></Suspense></PageTransition>} />

              <Route path="access-control" element={<PageTransition><Suspense fallback={<Loading />}><AccessControl /></Suspense></PageTransition>} />
              <Route path="badges" element={<PageTransition><Suspense fallback={<Loading />}><Badges /></Suspense></PageTransition>} />
              <Route path="member-portal" element={<PageTransition><Suspense fallback={<Loading />}><MemberPortal /></Suspense></PageTransition>} />
              <Route path="coach-mode" element={<PageTransition><Suspense fallback={<Loading />}><CoachMode /></Suspense></PageTransition>} />
              <Route path="coach-portal" element={<PageTransition><Suspense fallback={<Loading />}><CoachPortal /></Suspense></PageTransition>} />
              <Route path="rh" element={<PageTransition><Suspense fallback={<Loading />}><Rh /></Suspense></PageTransition>} />
              <Route path="expenses" element={<PageTransition><Suspense fallback={<Loading />}><Expenses /></Suspense></PageTransition>} />
              <Route path="assistant-comptable" element={<PageTransition><Suspense fallback={<Loading />}><AssistantComptable /></Suspense></PageTransition>} />
              <Route path="reports" element={<PageTransition><Suspense fallback={<Loading />}><Reports /></Suspense></PageTransition>} />
              <Route path="rentabilite" element={<PageTransition><Suspense fallback={<Loading />}><Rentabilite /></Suspense></PageTransition>} />
              <Route path="corporate" element={<PageTransition><Suspense fallback={<Loading />}><Corporate /></Suspense></PageTransition>} />
              <Route path="notifications" element={<PageTransition><Suspense fallback={<Loading />}><Notifications /></Suspense></PageTransition>} />
              <Route path="settings" element={<PageTransition><Suspense fallback={<Loading />}><Settings /></Suspense></PageTransition>} />
              <Route path="settings/diagnostics" element={<PageTransition><Suspense fallback={<Loading />}><Diagnostics /></Suspense></PageTransition>} />
              <Route path="settings/security" element={<PageTransition><Suspense fallback={<Loading />}><Security /></Suspense></PageTransition>} />
              <Route path="profile" element={<PageTransition><Suspense fallback={<Loading />}><Profile /></Suspense></PageTransition>} />
              <Route path="admin/users" element={<PageTransition><Suspense fallback={<Loading />}><AdminUsers /></Suspense></PageTransition>} />
              <Route path="admin/audit" element={<PageTransition><Suspense fallback={<Loading />}><Audit /></Suspense></PageTransition>} />
              <Route path="display" element={<PageTransition><Suspense fallback={<Loading />}><Display /></Suspense></PageTransition>} />
              <Route path="ai-assistant" element={<PageTransition><Suspense fallback={<Loading />}><AiAssistant /></Suspense></PageTransition>} />
              <Route path="member-insights" element={<PageTransition><Suspense fallback={<Loading />}><MemberInsights /></Suspense></PageTransition>} />
              <Route path="install" element={<PageTransition><Suspense fallback={<Loading />}><Install /></Suspense></PageTransition>} />
            </Route>
            <Route path="*" element={<NotFound />} />
            </Routes>
          </AiChatProvider>
        </AnimatePresence>
      </ErrorBoundary>
    </AuthProvider>
  )
}