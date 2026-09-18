import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Eye, EyeOff, Loader2, User, Lock, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'

const receptSchema = z.object({
  identifier: z.string().min(1, "Nom d'utilisateur requis"),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
})

type ReceptForm = z.infer<typeof receptSchema>

type Tab = 'admin' | 'reception'

export default function SignIn() {
  const t = useT()
  const navigate = useNavigate()
  const { signIn, sendOtp, verifyOtpCode, verifyMfa, prepareMfa } = useAuth()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('admin')
  const [showPassword, setShowPassword] = useState(false)

  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isOtpLoading, setIsOtpLoading] = useState(false)

  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [isMfaLoading, setIsMfaLoading] = useState(false)

  const [showAuthenticator, setShowAuthenticator] = useState(false)

  const form = useForm<ReceptForm>({
    resolver: zodResolver(receptSchema),
    defaultValues: { identifier: '', password: '' },
  })

  async function onReceptSubmit(values: ReceptForm) {
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
      return
    }
    navigate('/dashboard', { replace: true })
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
              { icon: "📊", title: t('auth.gridStats') },
              { icon: "👥", title: t('auth.gridMembers') },
              { icon: "💳", title: t('auth.gridSubscriptions') },
              { icon: "🛒", title: t('auth.gridPos') },
              { icon: "📅", title: t('auth.gridPlanning') },
              { icon: "🔒", title: t('auth.gridRfid') },
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
            <h2 className="text-2xl font-bold text-white text-center mb-6">{t('auth.welcomeTitle')}</h2>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 border border-white/10 p-1 mb-6">
              <button
                type="button"
                onClick={() => setTab('admin')}
                className={`h-10 rounded-lg text-sm font-semibold transition-colors ${tab === 'admin' ? 'bg-primary text-white shadow' : 'text-white/60 hover:text-white'}`}
              >
                {t('auth.adminTab')}
              </button>
              <button
                type="button"
                onClick={() => setTab('reception')}
                className={`h-10 rounded-lg text-sm font-semibold transition-colors ${tab === 'reception' ? 'bg-primary text-white shadow' : 'text-white/60 hover:text-white'}`}
              >
                {t('auth.receptionTab')}
              </button>
            </div>

            {/* Admin panel */}
            {tab === 'admin' && (
              <div className="space-y-3">
                {mfaFactorId ? (
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
                    <button onClick={() => setMfaFactorId('')} className="w-full text-center text-xs text-white/40 hover:text-white/70">
                      ← {t('auth.backToOther')}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Email OTP : primary flow */}
                    <div className="space-y-3">
                      {!otpSent ? (
                        <>
                          <p className="text-xs text-white/50">{t('auth.otpDescription')}</p>
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
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs text-white/40 uppercase tracking-wider">{t('auth.or')}</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    {/* Authenticator */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 bg-white/5 hover:bg-white/10 border-white/10 text-white font-medium gap-2"
                      onClick={() => setShowAuthenticator(!showAuthenticator)}
                    >
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {t('auth.connectAuthenticator')}
                    </Button>
                    {showAuthenticator && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                        <p className="text-xs text-white/60">{t('auth.authenticatorInfo1')}</p>
                        <p className="text-xs text-white/60">{t('auth.authenticatorInfo2')}</p>
                      </div>
                    )}
                    <p className="text-center text-xs text-white/40 pt-1">
                      <ShieldCheck className="inline h-3.5 w-3.5 mr-1 mb-0.5" />
                      {t('auth.mfaStepHint')}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Reception panel */}
            {tab === 'reception' && (
              <div className="space-y-3">
                <p className="text-xs text-white/50">{t('auth.receptionDesc')}</p>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onReceptSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="identifier"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                              <Input
                                type="text"
                                placeholder={t('auth.usernamePlaceholder')}
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
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                              <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
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
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}