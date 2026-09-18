import { useState, useEffect, useCallback } from "react"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { Loader2, ShieldCheck, Mail, Smartphone, Check, KeyRound, QrCode } from "lucide-react"

interface MfaFactor {
  id: string
  status: string
  type: string
  friendlyName?: string | null
}

export default function SecurityPage() {
  const t = useT()
  const { toast } = useToast()
  const { listMfa, enrollTOTP, verifyTOTPEnroll, unenrollMFA } = useAuth()

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
          {/* Email OTP */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{t('auth.emailOtpAvailable')}</p>
                <p className="text-sm text-muted-foreground">{t('auth.emailOtpAvailableDesc')}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              {t('auth.activated')}
            </span>
          </div>

          {/* Authenticator */}
          {loadingFactors ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{t('auth.authenticator')}</p>
                  <p className="text-sm text-muted-foreground">{t('auth.authenticatorDesc')}</p>
                </div>
              </div>
              {verifiedTotp ? (
                <Button variant="destructive" size="sm" onClick={() => askDisable(verifiedTotp.id)}>
                  {t('auth.authenticatorDisable')}
                </Button>
              ) : (
                <Button size="sm" onClick={startSetup}>
                  <QrCode className="mr-2 h-4 w-4" />
                  {t('auth.authenticatorConfig')}
                </Button>
              )}
            </div>
          )}

          {verifiedTotp && (
            <div className="flex items-center justify-between rounded-lg border p-4 bg-emerald-500/5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">{t('auth.authenticatorConfigured')}</p>
                  <p className="text-sm text-muted-foreground">{t('auth.authenticatorEnabledDesc')}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                {t('auth.activated')}
              </span>
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
