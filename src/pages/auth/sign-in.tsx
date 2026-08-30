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
import { Eye, EyeOff, Loader2, User, Lock } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'

const signInSchema = z.object({
  identifier: z.string().min(1, "Email, téléphone ou nom d'utilisateur requis"),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type SignInForm = z.infer<typeof signInSchema>

export default function SignIn() {
  const t = useT()
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

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
    setRecoveryEmail(form.getValues('identifier'))
    setGeneratedCode('')
    setRecoveryDialogOpen(true)
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
            <img src="/QLG_3D-removebg-preview-opt.png" alt="QLF GYM" className="h-32 w-auto drop-shadow-lg" />
          </motion.div>

          {/* Welcome */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-sm font-semibold tracking-[0.15em] uppercase text-[#054AC2] mb-4"
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
            <span className="text-[#054AC2]">{t('auth.withEase')}</span>
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
                <div className="w-14 h-14 rounded-xl bg-[#054AC2]/15 border border-[#054AC2]/20 flex items-center justify-center">
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
            <img src="/QLG_3D-removebg-preview-opt.png" alt="QLF GYM" className="h-12 w-auto drop-shadow-lg" />
          </div>

          {/* Form card */}
          <div className="bg-[#0a0f1a]/90 backdrop-blur-xl border border-[#054AC2]/30 rounded-2xl p-8 shadow-2xl shadow-[#054AC2]/10">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <picture>
                <source srcSet="/LOGO QLForiginal.webp" type="image/webp" />
                <img src="/LOGO QLForiginal-opt.png" alt="FitManagerPro" className="h-28 w-auto drop-shadow-xl" />
              </picture>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white text-center mb-1">{t('auth.welcomeTitle')}</h2>
            <p className="text-sm text-white/50 text-center mb-6">{t('auth.welcomeSubtitle')}</p>

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Email or identifier */}
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
                            placeholder="email, téléphone ou nom d'utilisateur"
                            className="h-11 pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#054AC2] focus:ring-[#054AC2]/30"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password */}
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
                            placeholder="••••••••"
                            className="h-11 pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#054AC2] focus:ring-[#054AC2]/30"
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

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-11 bg-[#054AC2] hover:bg-[#043da8] text-white font-semibold text-sm mt-2"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {form.formState.isSubmitting ? t('auth.signingIn') : t('auth.signInTitle')}
                </Button>
              </form>
            </Form>

            {/* Links */}
            <div className="mt-5 text-center text-sm text-white/50 space-y-2">
              <p>
                {t('auth.forgotPassword')}{' '}
                <Link to="/auth/recovery" className="text-[#054AC2] hover:text-[#054AC2]/80 font-semibold">
                  {t('auth.reset')}
                </Link>
              </p>
              <p>
                <button
                  type="button"
                  onClick={openRecoveryDialog}
                  className="text-[#054AC2] hover:text-[#054AC2]/80 font-semibold"
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
        <DialogContent className="sm:max-w-md bg-[#0a0f1a] border border-[#054AC2]/30 text-white">
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
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#054AC2] focus:ring-[#054AC2]/30"
              />
              <Button
                onClick={handleGenerateCode}
                disabled={isGenerating || !recoveryEmail}
                className="w-full h-11 bg-[#054AC2] hover:bg-[#043da8] text-white"
              >
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.generateCode')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="bg-white/5 border border-[#054AC2]/20 rounded-lg p-4">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 text-center">
                  {t('auth.yourRecoveryCode')}
                </p>
                <p className="text-2xl font-mono font-bold text-center text-[#054AC2] tracking-widest">
                  {generatedCode}
                </p>
              </div>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <p className="text-xs text-warning text-center">
                  ⚠️ {t('auth.savedCodeWarning')}
                </p>
              </div>
              <Button
                onClick={() => setRecoveryDialogOpen(false)}
                className="w-full h-11 bg-[#054AC2] hover:bg-[#043da8] text-white"
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
