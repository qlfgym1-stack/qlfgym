import { useState, useEffect } from "react"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { useT } from "@/i18n"
import {
  Smartphone, Monitor, Download, Share2, PlusCircle, CheckCircle2,
  ArrowRight, RefreshCw, Globe,
} from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export default function InstallPage() {
  const t = useT()
  const { toast } = useToast()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const installedHandler = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      toast({ title: t("install.installed") })
    }
    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", installedHandler)

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", installedHandler)
    }
  }, [t, toast])

  async function handleInstall() {
    try {
      if (!deferredPrompt) return
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        toast({ title: t("install.installed") })
      }
      setDeferredPrompt(null)
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" })
    }
  }

  return (
    <div>
      <PageHeader title={t("install.title")} description={t("install.description")} />

      <div className="space-y-6 max-w-3xl">
        {isInstalled ? (
          <Card className="border-success/50 bg-success/5">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-success" />
              <h2 className="text-2xl font-bold mb-2">{t("install.alreadyInstalled")}</h2>
              <p className="text-muted-foreground">{t("install.alreadyInstalledDescription")}</p>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="p-6 text-center">
              <Download className="h-16 w-16 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl font-bold mb-2">{t("install.readyToInstall")}</h2>
              <p className="text-muted-foreground mb-4">{t("install.readyDescription")}</p>
              <Button size="lg" onClick={handleInstall}>
                <Download className="mr-2 h-5 w-5" /> {t("install.installNow")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <Smartphone className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">{t("install.notAvailable")}</h2>
              <p className="text-muted-foreground">{t("install.notAvailableDescription")}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("install.manualInstall")}</CardTitle>
            <CardDescription>{t("install.manualInstallDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Monitor className="h-5 w-5" /> {t("install.desktop")}
              </h3>
              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">1</div>
                <div>
                  <p className="font-medium">{t("install.desktopStep1")}</p>
                  <p className="text-sm text-muted-foreground">{t("install.desktopStep1Desc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">2</div>
                <div>
                  <p className="font-medium">{t("install.desktopStep2")}</p>
                  <p className="text-sm text-muted-foreground">{t("install.desktopStep2Desc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">3</div>
                <div>
                  <p className="font-medium">{t("install.desktopStep3")}</p>
                  <p className="text-sm text-muted-foreground">{t("install.desktopStep3Desc")}</p>
                </div>
              </div>
            </div>

            <SeparatorLine />

            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="h-5 w-5" /> {t("install.mobile")}
              </h3>
              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">1</div>
                <div>
                  <p className="font-medium">{t("install.mobileStep1")}</p>
                  <p className="text-sm text-muted-foreground">{t("install.mobileStep1Desc")}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg border">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">2</div>
                <div>
                  <p className="font-medium">{t("install.mobileStep2")}</p>
                  <p className="text-sm text-muted-foreground">{t("install.mobileStep2Desc")}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SeparatorLine() {
  return <div className="border-t" />
}
