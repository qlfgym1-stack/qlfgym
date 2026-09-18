import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Eye, EyeOff, Loader2, User, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'

const signInSchema = z.object({
  identifier: z.string().min(1, "Email, tÃ©lÃ©phone ou nom d'utilisateur requis"),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type SignInForm = z.infer<typeof signInSchema>

type View = 'methods' | 'otp' | 'mfa'

export default function SignIn() {
  const t = useT()
  const navigate = useNavigate()
  const { signIn, sendOtp, verifyOtpCode, verifyMfa, prepareMfa, signInWithProvider } = useAuth()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [view, setView] = useState<View>('methods')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isOtpLoading, setIsOtpLoading] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [isMfaLoading, setIsMfaLoading] = useState(false)
  const [providerLoading, setProviderLoading] = useState<'google' | 'apple' | null>(null)

  const form = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { identifier: '', password: '' },
  })

  async function onSubmit(values: SignInForm) {
    const { error } = await signIn(values.identifier, values.password)
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
      return
    }
    const { error: mfaError, factorId } = await prepareMfa()
    if (mfaError) {
      toast({ variant: 'destructive', title: t('auth.error'), description: mfaError.message })
      return
    }
    if (factorId) {
      setMfaFactorId(factorId)
      setView('mfa')
      return
    }
    navigate('/dashboard', { replace: true })
  }

  async function handleGenerateCode() {
    if (!recoveryEmail) return
    setIsGenerating(true)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
      const res = await fetch(`${supabaseUrl}/functions/v1/recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'send_code', email: recoveryEmail }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast({ variant: 'destructive', title: t('auth.error'), description: data.error || t('auth.unexpectedError') })
        return
      }
      setGeneratedCode(data.newCode || '')
    } catch {
      toast({ variant: 'destructive', title: t('auth.error'), description: t('auth.codeGenerationFailed') })
    } finally {
      setIsGenerating(false)
    }
  }

  function openRecoveryDialog() {
    setRecoveryEmail(form.getValues('identifier') || otpEmail)
    setGeneratedCode('')
    setRecoveryDialogOpen(true)
  }

  async function handleOtpSend() {
    if (!otpEmail || !otpEmail.includes('@')) {
      toast({ variant: 'destructive', title: t('auth.error'), description: t('errors.invalidEmail') })
      return
    }
    setIsOtpLoading(true)
    const { error } = await sendOtp(otpEmail)
    setIsOtpLoading(false)
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
      return
    }
    setOtpSent(true)
    toast({ title: t('auth.otpSent').replace('{email}', otpEmail) })
  }

  async function handleOtpVerify() {
    if (!otpCode || otpCode.length < 6) {
      toast({ variant: 'destructive', title: t('auth.error'), description: t('errors.invalidEmail') })
      return
    }
    setIsOtpLoading(true)
    const { error, requiresMfa, factorId } = await verifyOtpCode(otpEmail, otpCode)
    setIsOtpLoading(false)
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
      return
    }
    if (requiresMfa && factorId) {
      setMfaFactorId(factorId)
      setView('mfa')
      return
    }
    navigate('/dashboard', { replace: true })
  }

  async function handleMfaVerify() {
    if (!mfaCode || mfaCode.length < 6) return
    setIsMfaLoading(true)
    const { error } = await verifyMfa(mfaFactorId, mfaCode)
    setIsMfaLoading(false)
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
      return
    }
    navigate('/dashboard', { replace: true })
  }

  async function handleProvider(provider: 'google' | 'apple') {
    setProviderLoading(provider)
    const { error } = await signInWithProvider(provider)
    setProviderLoading(null)
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
    }
  }

  function switchToOtp() {
    setView('otp')
    setOtpSent(false)
    setOtpCode('')
  }

  function resetView() {
    setView('methods')
    setOtpSent(false)
    setOtpCode('')
    setOtpEmail('')
  }

  return (
    <div className="h-screen flex relative overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }} />
      <div className="absolute inset-0 bg-black/40" />

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10">
        <div className="flex flex-col justify-center w-full px-16 h-screen">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 mt-16"
          >
            <img src="/QLG_3D-removebg-preview-opt.png" alt="Fitmanager Pro Dz" className="h-32 w-auto drop-shadow-lg" />
          </motion.div>

          {/* Welcome */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm font-semibold tracking-[0.15em] uppercase text-primary mb-4"
          >
            {t('auth.welcome')}
          </motion.p>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="text-5xl font-bold leading-[1.1] text-white mb-5"
          >
            {t('auth.manageYourGym')}<br />
            <span className="text-primary">{t('auth.withEase')}</span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-base text-white max-w-lg leading-relaxed mb-10"
          >
            {t('auth.heroDescription')}
          </motion.p>

          {/* Features grid */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="grid grid-cols-3 gap-x-8 gap-y-6 mb-12"
          >
            {[
              { icon: "ðŸ“Š", title: t('auth.gridStats') },
              { icon: "ðŸ‘¥", title: t('auth.gridMembers') },
              { icon: "ðŸ’³", title: t('auth.gridSubscriptions') },
              { icon: "ðŸ›’", title: t('auth.gridPos') },
              { icon: "ðŸ“…", title: t('auth.gridPlanning') },
              { icon: "ðŸ”’", title: t('auth.gridRfid') },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                  <span className="text-2xl">{item.icon}</span>
                </div>
                <span className="text-xs font-semibold text-white/80 tracking-wider text-center">{item.title}</span>
              </div>
            ))}
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <div className="w-48 h-px bg-white/10 mb-4" />
            <p className="text-sm font-semibold tracking-[0.2em] text-white/50">
              {t('auth.tagline')}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-10 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-6">
            <img src="/QLG_3D-removebg-preview-opt.png" alt="Fitmanager Pro Dz" className="h-12 w-auto drop-shadow-lg" />
          </div>

          {/* Form card */}
          <div className="bg-card/90 backdrop-blur-xl border border-primary/30 rounded-2xl p-8 shadow-2xl shadow-primary/10">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <picture>
                <source srcSet="/LOGO QLForiginal.webp" type="image/webp" />
                <img src="/LOGO QLForiginal-opt.png" alt="Fitmanager Pro Dz" className="h-28 w-auto drop-shadow-xl" />
              </picture>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white text-center mb-1">{t('auth.welcomeTitle')}</h2>
            <p className="text-sm text-white/50 text-center mb-6">{t('auth.welcomeSubtitle')}</p>

            {view === 'methods' && (
              <div className="space-y-3">
                {/* OAuth */}
                <Button
                  variant="outline"
                  className="w-full h-11 bg-white hover:bg-white/90 text-neutral-800 font-medium gap-2"
                  disabled={providerLoading === 'google'}
                  onClick={() => handleProvider('google')}
                >
                  {providerLoading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  )}
                  {t('auth.continueWithGoogle')}
                </Button>

                <Button
                  variant="outline"
                  className="w-full h-11 bg-white hover:bg-white/90 text-neutral-800 font-medium gap-2"
                  disabled={providerLoading === 'apple'}
                  onClick={() => handleProvider('apple')}
                >
                  {providerLoading === 'apple' ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <svg className="h-4 w-4" viewBox="0 0 384 512" fill="currentColor">
                      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                    </svg>
                  )}
                  {t('auth.continueWithApple')}
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs text-white/40 uppercase tracking-wider">{t('auth.or')}</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                {/* Email OTP */}
                <Button
                  variant="outline"
                  className="w-full h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 gap-2"
                  onClick={switchToOtp}
                >
                  <Mail className="h-4 w-4" />
                  {t('auth.otpTitle')}
                </Button>
              </div>
            )}

            {view === 'otp' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">{t('auth.otpTitle')}</h3>
                <p className="text-xs text-white/50">{t('auth.otpDescription')}</p>
                {!otpSent ? (
                  <>
                    <Input
                      type="email"
                      placeholder={t('auth.otpEmailPlaceholder')}
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/30"
                    />
                    <Button
                      onClick={handleOtpSend}
                      disabled={isOtpLoading || !otpEmail}
                      className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
                    >
                      {isOtpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('auth.otpSendCode')}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="bg-white/5 border border-primary/20 rounded-lg p-3 text-center">
                      <p className="text-xs text-white/60">{t('auth.otpCodeSentDesc')}</p>
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder={t('auth.otpCodePlaceholder')}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleOtpVerify() }}
                      className="h-11 text-center font-mono text-lg tracking-widest bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/30"
                    />
                    <Button
                      onClick={handleOtpVerify}
                      disabled={isOtpLoading || otpCode.length < 6}
                      className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
                    >
                      {isOtpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('auth.otpVerify')}
                    </Button>
                    <Button variant="ghost" className="w-full text-white/50 hover:text-white" onClick={handleOtpSend} disabled={isOtpLoading}>
                      {t('auth.otpResend')}
                    </Button>
                  </>
                )}
                <button onClick={resetView} className="w-full text-center text-xs text-white/40 hover:text-white/70">
                  â† {t('auth.backToOther')}
                </button>
              </div>
            )}

            {view === 'mfa' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white">{t('auth.mfaTitle')}</h3>
                <p className="text-xs text-white/50">{t('auth.mfaDescription')}</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t('auth.mfaCodePlaceholder')}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleMfaVerify() }}
                  className="h-11 text-center font-mono text-lg tracking-widest bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/30"
                />
                <Button
                  onClick={handleMfaVerify}
                  disabled={isMfaLoading || mfaCode.length < 6}
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
                >
                  {isMfaLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('auth.mfaVerify')}
                </Button>
                <button onClick={resetView} className="w-full text-center text-xs text-white/40 hover:text-white/70">
                  â† {t('auth.backToOther')}
                </button>
              </div>
            )}

            {/* Password fallback form */}
            <div className={view === 'methods' ? 'pt-4' : 'hidden'}>
              <div className="flex items-center gap-3 py-1 mb-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-white/40 uppercase tracking-wider">{t('auth.password')}</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              {view === 'methods' && (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="identifier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('auth.emailLabel')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                              <Input
                                type="text"
                                placeholder="email, tÃ©lÃ©phone ou nom d'utilisateur"
                                className="h-11 pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/30"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('auth.password')}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                              <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                                className="h-11 pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/30"
                                {...field}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold text-sm mt-2"
                      disabled={form.formState.isSubmitting}
                    >
                      {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {form.formState.isSubmitting ? t('auth.signingIn') : t('auth.signInTitle')}
                    </Button>
                  </form>
                </Form>
              )}
            </div>

            {/* Links */}
            <div className="mt-5 text-center text-sm text-white/50 space-y-2">
              <p>
                {t('auth.forgotPassword')}{' '}
                <Link to="/auth/recovery" className="text-primary hover:text-primary/80 font-semibold">
                  {t('auth.reset')}
                </Link>
              </p>
              <p>
                <button
                  type="button"
                  onClick={openRecoveryDialog}
                  className="text-primary hover:text-primary/80 font-semibold"
                >
                  {t('auth.getRecoveryCode')}
                </button>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recovery code dialog */}
      <Dialog open={recoveryDialogOpen} onOpenChange={setRecoveryDialogOpen}>
        <DialogContent className="sm:max-w-md bg-[#0a0f1a] border border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle>{t('auth.recoveryTitle')}</DialogTitle>
            <DialogDescription className="text-white/50">
              {t('auth.recoveryDescription')}
            </DialogDescription>
          </DialogHeader>

          {!generatedCode ? (
            <div className="space-y-4 py-2">
              <Input
                type="email"
                placeholder="votre@email.com"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/30"
              />
              <Button
                onClick={handleGenerateCode}
                disabled={isGenerating || !recoveryEmail}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
              >
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.generateCode')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="bg-white/5 border border-primary/20 rounded-lg p-4">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 text-center">
                  {t('auth.yourRecoveryCode')}
                </p>
                <p className="text-2xl font-mono font-bold text-center text-primary tracking-widest">
                  {generatedCode}
                </p>
              </div>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <p className="text-xs text-warning text-center">
                  âš ï¸ {t('auth.savedCodeWarning')}
                </p>
              </div>
              <Button
                onClick={() => setRecoveryDialogOpen(false)}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white"
              >
                {t('auth.savedCodeButton')}
              </Button>
            </div>
          )}

          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="ghost" onClick={() => setRecoveryDialogOpen(false)} className="text-white/50 hover:text-white">
              {t('auth.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
