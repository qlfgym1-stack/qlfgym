import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Dumbbell, Eye, EyeOff, Loader2, Shield, Zap, Users, BarChart3, Copy, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'

const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  gymName: z.string().min(2, 'Gym name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type SignUpForm = z.infer<typeof signUpSchema>

export default function SignUp() {
  const t = useT()
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)

  const form = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirmPassword: '', gymName: '' },
  })

  async function onSubmit(values: SignUpForm) {
    const slug = values.gymName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const { error, recoveryCode: code } = await signUp(values.email, values.password, { name: values.gymName, slug })
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message })
      return
    }
    if (code) {
      setRecoveryCode(code)
    } else {
      toast({ title: 'Account created', description: 'Welcome to Fitmanager Pro Dz!' })
      navigate('/dashboard', { replace: true })
    }
  }

  function onDismissRecoveryCode() {
    navigate('/dashboard', { replace: true })
  }

  function copyCode() {
    if (recoveryCode) {
      navigator.clipboard.writeText(recoveryCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Full-screen background image */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(0.3) saturate(1.2)',
      }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a12]/80 via-[#0a0a12]/50 to-[#0a0a12]/70" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a12]/60 via-transparent to-[#0a0a12]/20" />
      <motion.div
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-20 -left-20 w-[500px] h-[500px] bg-primary/15 rounded-full blur-[150px]"
      />
      <motion.div
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[150px]"
      />

      {/* Left: Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10">
        <div className="flex flex-col justify-between p-16 w-full">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30">
              <Dumbbell className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">
              <span className="text-gradient">Fitmanager Pro Dz</span>
            </span>
          </motion.div>
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              <h1 className="text-5xl font-bold leading-tight text-white">
                <span className="stroke-text text-6xl block mb-2">START</span>
                <span>Your Journey.</span>
                <span className="text-gradient block text-5xl mt-2 pb-1">Join Today.</span>
              </h1>
              <p className="mt-6 text-lg text-white/50 max-w-md leading-relaxed">
                Create your gym management account and take control of every aspect of your fitness business.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="space-y-4"
            >
              {[
                { icon: Shield, text: "Role-based access control" },
                { icon: Zap, text: "Real-time attendance & check-in" },
                { icon: Users, text: "Member management & subscriptions" },
                { icon: BarChart3, text: "Revenue & performance analytics" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm text-white/60">{item.text}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="text-xs text-white/20"
          >
            &copy; 2026 Fitmanager Pro Dz. All rights reserved.
          </motion.p>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative bg-transparent">
        <div className="absolute inset-0 pointer-events-none lg:hidden">
          <motion.div
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
          />
          <motion.div
            animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-20 right-10 w-[30rem] h-[30rem] bg-secondary/15 rounded-full blur-3xl"
          />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-lg relative"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary shadow-lg">
              <Dumbbell className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-gradient">Fitmanager Pro Dz</span>
            </span>
          </div>
          <Card className="shadow-2xl glass-card gradient-border">
            <CardHeader className="text-center space-y-2 pb-6 pt-10">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20"
              >
                <Dumbbell className="h-8 w-8 text-white" />
              </motion.div>
              <CardTitle className="text-3xl font-bold">
                <span className="text-gradient">Create account</span>
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Start managing your gym in minutes
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-8 px-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="gymName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Gym Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Fitness Gym" className="h-11 text-base" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" className="h-11 text-base" {...field} />
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
                        <FormLabel className="text-sm font-medium">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="h-11 text-base pr-10" {...field} />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 px-3" onClick={() => setShowPassword(!showPassword)}>
                              {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type={showConfirm ? 'text' : 'password'} placeholder="••••••••" className="h-11 text-base pr-10" {...field} />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 px-3" onClick={() => setShowConfirm(!showConfirm)}>
                              {showConfirm ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" size="lg" className="w-full h-11 text-base font-semibold" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              </Form>
              <div className="mt-8 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/auth" className="font-semibold text-primary hover:underline">
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={!!recoveryCode} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center space-y-4 pt-6">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold">Account Created Successfully</DialogTitle>
            <DialogDescription className="text-base">
              Your recovery code is shown below. Save it in a safe place. You will need it to recover your account if you forget your password.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-5">
            <div className="bg-muted rounded-lg p-4 text-center">
              <code className={`text-lg font-mono tracking-widest ${showCode ? "text-foreground" : "text-muted"}`}>
                {showCode ? recoveryCode : recoveryCode?.replace(/./g, "•")}
              </code>
            </div>
            <div className="flex justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCode(!showCode)}>
                {showCode ? "Hide" : "Show"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={copyCode}>
                <Copy className="h-4 w-4 mr-1" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              This code will not be shown again. If you lose it, you will need to generate a new one.
            </p>
            <Button onClick={onDismissRecoveryCode} size="lg" className="w-full h-11 text-base font-semibold">
              I&#39;ve saved my recovery code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
