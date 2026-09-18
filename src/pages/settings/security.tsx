import { useState, useEffect, useCallback } from "react"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { Loader2, ShieldCheck, Mail, Smartphone, Check, X, KeyRound } from "lucide-react"

interface MfaFactor {
  id: string
  status: string
  type: string
  friendlyName?: string | null
}

export default function SecurityPage() {
  const t = useT()
  const { toast } = useToast()
  const { user, listMfa, enrollTOTP, verifyTOTPEnroll, unenrollMFA } = useAuth()

  const [factors, setFactors] = useState<MfaFactor[]>([])
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [enrollFactorId, setEnrollFactorId] = useState("")
  const [qrCode, setQrCode] = useState("")
  const [enrollCode, setEnrollCode] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [disableFactorId, setDisableFactorId] = useState("")
  const [isDisabling, setIsDisabling] = useState(false)

  const verifiedTotp = factors.find(f => f.status === 'verified' && f.type === 'totp')

  const refreshFactors = useCallback(async () => {
    setLoadingFactors(true)
    const { factors: list } = await listMfa()
    setFactors((list as MfaFactor[]) || [])
    setLoadingFactors(false)
  }, [listMfa])

  useEffect(() => { refreshFactors() }, [refreshFactors])

  const providers = (user?.identities || []).map(i => i.provider)
  const hasGoogle = providers.includes('google')
  const hasApple = providers.includes('apple')

  async function startSetup() {
    const { error, factorId, qrCode: qr } = await enrollTOTP()
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
      return
    }
    setEnrollFactorId(factorId || "")
    setQrCode(qr || "")
    setEnrollCode("")
    setSetupOpen(true)
  }

  async function confirmSetup() {
    if (!enrollCode || enrollCode.length < 6) return
    setIsVerifying(true)
    const { error } = await verifyTOTPEnroll(enrollFactorId, enrollCode)
    setIsVerifying(false)
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
      return
    }
    setSetupOpen(false)
    toast({ title: t('auth.authenticatorEnabled'), description: t('auth.authenticatorEnabledDesc') })
    refreshFactors()
  }

  function askDisable(factorId: string) {
    setDisableFactorId(factorId)
    setDisableOpen(true)
  }

  async function confirmDisable() {
    setIsDisabling(true)
    const { error } = await unenrollMFA(disableFactorId)
    setIsDisabling(false)
    if (error) {
      toast({ variant: 'destructive', title: t('auth.error'), description: error.message })
      return
    }
    setDisableOpen(false)
    toast({ title: t('auth.authenticatorDisabled'), description: t('auth.authenticatorDisableDesc') })
    refreshFactors()
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('auth.security')} description={t('auth.securityDescription')} />

      {/* Sign-in methods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t('auth.security')}
          </CardTitle>
          <CardDescription>{t('auth.securityDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{t('auth.emailOtpAvailable')}</p>
                <p className="text-sm text-muted-foreground">{t('auth.emailOtpAvailableDesc')}</p>
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground">OTP</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              </span>
              <div>
                <p className="font-medium">{t('auth.googleConnected')}</p>
                <p className="text-sm text-muted-foreground">
                  {hasGoogle ? t('auth.googleConnected') : t('auth.googleNotConnected')}
                </p>
              </div>
            </div>
            {hasGoogle ? <Check className="h-5 w-5 text-green-500" /> : <X className="h-5 w-5 text-muted-foreground" />}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center">
                <svg className="h-5 w-5" viewBox="0 0 384 512" fill="currentColor">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
              </span>
              <div>
                <p className="font-medium">{t('auth.appleConnected')}</p>
                <p className="text-sm text-muted-foreground">
                  {hasApple ? t('auth.appleConnected') : t('auth.appleNotConnected')}
                </p>
              </div>
            </div>
            {hasApple ? <Check className="h-5 w-5 text-green-500" /> : <X className="h-5 w-5 text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {/* MFA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('auth.authenticator')}
          </CardTitle>
          <CardDescription>{t('auth.authenticatorSetupDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingFactors ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : verifiedTotp ? (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">{t('auth.authenticatorConfigured')}</p>
                  <p className="text-sm text-muted-foreground">{t('auth.authenticatorEnabledDesc')}</p>
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => askDisable(verifiedTotp.id)}>
                {t('auth.authenticatorDisable')}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{t('auth.authenticatorSetup')}</p>
                  <p className="text-sm text-muted-foreground">{t('auth.authenticatorSetupDesc')}</p>
                </div>
              </div>
              <Button size="sm" onClick={startSetup}>{t('auth.authenticatorConfig')}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup dialog */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('auth.authenticatorSetup')}</DialogTitle>
            <DialogDescription>{t('auth.authenticatorScanDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} alt="QR code" className="h-48 w-48 rounded-lg border p-2 bg-white" />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('auth.authenticatorCode')}</label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmSetup() }}
                className="text-center font-mono text-lg tracking-widest"
                placeholder="000000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetupOpen(false)}>{t('auth.cancel')}</Button>
            <Button onClick={confirmSetup} disabled={isVerifying || enrollCode.length < 6}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('auth.authenticatorVerify')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('auth.authenticatorDisable')}</DialogTitle>
            <DialogDescription>{t('auth.authenticatorDisableDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>{t('auth.cancel')}</Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={isDisabling}>
              {isDisabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDisabling ? t('auth.deactivating') : t('auth.authenticatorDisable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
