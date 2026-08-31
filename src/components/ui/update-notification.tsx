import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, RefreshCw, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useVersion } from '@/stores/version';
import { useToast } from '@/components/ui/toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let capturedInstallPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    capturedInstallPrompt = e as BeforeInstallPromptEvent;
  });
}

function useStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setIsStandalone(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isStandalone;
}

function UpdateBanner() {
  const t = useT();
  const isStandalone = useStandalone();
  const { isUpdateAvailable, isUpdateRequired, dismissUpdate, onlineVersion, checkVersion, isChecking, localVersion } = useVersion();
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installStage, setInstallStage] = useState<'idle' | 'downloading' | 'installing' | 'activating' | 'done'>('idle');

  useEffect(() => {
    if (!isStandalone) {
      setShowBanner(false);
      setShowModal(false);
      return;
    }
    if (isUpdateAvailable) {
      const timer = setTimeout(() => {
        setShowBanner(true);
        if (isUpdateRequired) setShowModal(true);
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      setShowBanner(false);
      setShowModal(false);
    }
  }, [isUpdateAvailable, isUpdateRequired, isStandalone]);

  const handleUpdate = async () => {
    setShowModal(true);
    setShowBanner(false);
    setInstallStage('downloading');
    setInstallProgress(0);

    try {
      const registration = await navigator.serviceWorker.ready;
      const updateFound = await new Promise<boolean>((resolve) => {
        let resolved = false;
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            controller.abort();
            resolve(false);
          }
        }, 30000);

        const handleUpdate = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(true);
          }
        };

        navigator.serviceWorker.addEventListener('controllerchange', handleUpdate, { once: true });
        registration.update().catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(false);
          }
        });
      });

      if (updateFound) {
        setInstallStage('installing');
        setInstallProgress(50);
        await new Promise(r => setTimeout(r, 1000));
        setInstallStage('activating');
        setInstallProgress(75);
        await new Promise(r => setTimeout(r, 500));
        setInstallStage('done');
        setInstallProgress(100);
        await new Promise(r => setTimeout(r, 500));
        window.location.reload();
      } else {
        const toast = (window as any).__TOAST__;
        if (toast) {
          toast({ title: t('update.alreadyLatest'), variant: 'default' });
        }
        setInstallStage('idle');
        if (!isUpdateRequired) setShowModal(false);
      }
    } catch {
      const toast = (window as any).__TOAST__;
      if (toast) {
        toast({ title: t('update.error'), variant: 'destructive' });
      }
      setInstallStage('idle');
      if (!isUpdateRequired) setShowModal(false);
    }
  };

  const handleDismiss = () => {
    dismissUpdate();
    setShowBanner(false);
    setShowModal(false);
  };

  if (!showBanner && !showModal) return null;

  const isMandatory = isUpdateRequired;
  const versionText = onlineVersion ? `${onlineVersion.version} (${onlineVersion.build})` : '';

  return (
    <AnimatePresence>
      {showBanner && !isMandatory && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-4 left-4 right-4 z-50 px-4 py-2 md:left-auto md:w-96 md:rounded-xl md:shadow-lg border-t border-primary/20 bg-primary/95 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <Download className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-foreground">{t('update.newVersionAvailable')}</p>
                <p className="text-xs text-primary-foreground/80">{t('update.version')}: {versionText}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={handleDismiss}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={handleUpdate}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> {t('update.updateNow')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={isMandatory ? undefined : () => { setShowModal(false); setShowBanner(false); }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md mx-4 rounded-2xl border bg-background p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="update-dialog-title"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${isMandatory ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  {isMandatory ? <AlertCircle className="h-6 w-6" /> : <Download className="h-6 w-6" />}
                </div>
                <div>
                  <h2 id="update-dialog-title" className="text-xl font-bold">
                    {isMandatory ? t('update.mandatoryTitle') : t('update.optionalTitle')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isMandatory ? t('update.mandatoryDescription') : t('update.optionalDescription')}
                  </p>
                </div>
              </div>

              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('update.currentVersion')}</span>
                      <span className="font-medium">{localVersion?.version} ({localVersion?.build})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('update.newVersion')}</span>
                      <span className="font-medium text-primary">{versionText}</span>
                    </div>
                    {onlineVersion?.releaseNotes && (
                      <div className="pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{t('update.releaseNotes')}</p>
                        <p className="text-xs text-muted-foreground">{onlineVersion.releaseNotes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {installStage !== 'idle' && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{t(`update.stage.${installStage}`)}</span>
                    <span className="font-medium">{installProgress}%</span>
                  </div>
                  <Progress value={installProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {installStage === 'downloading' && t('update.downloading')}
                    {installStage === 'installing' && t('update.installing')}
                    {installStage === 'activating' && t('update.activating')}
                    {installStage === 'done' && t('update.finalizing')}
                  </p>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                {isMandatory ? (
                  <Button className="flex-1" onClick={handleUpdate} disabled={installStage !== 'idle'}>
                    {installStage === 'downloading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {installStage === 'installing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {installStage === 'activating' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {installStage === 'done' && <CheckCircle2 className="mr-2 h-4 w-4" />}
                    {t(`update.button.${installStage === 'idle' ? 'update' : installStage}`)}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="flex-1" onClick={() => { setShowModal(false); setShowBanner(false); }} disabled={installStage !== 'idle'}>
                      <X className="mr-2 h-4 w-4" /> {t('common.later')}
                    </Button>
                    <Button className="flex-1" onClick={handleUpdate} disabled={installStage !== 'idle'}>
                      {installStage === 'downloading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {installStage === 'installing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {installStage === 'activating' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {installStage === 'done' && <CheckCircle2 className="mr-2 h-4 w-4" />}
                      {t(`update.button.${installStage === 'idle' ? 'update' : installStage}`)}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}

function InstallPrompt() {
  const t = useT();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(capturedInstallPrompt);
  const [showPrompt, setShowPrompt] = useState(!!capturedInstallPrompt);
  const [isIOS, setIsIOS] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }
    setIsIOS(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      capturedInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      setFallback(false);
      setShowPrompt(true);
      // Debug : vérifier que l'événement arrive bien (DevTools)
      console.log('[PWA] beforeinstallprompt capturé — installation disponible');
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setIsInstalled(true);
      capturedInstallPrompt = null;
      setDeferredPrompt(null);
      setShowPrompt(false);
      toast({ title: t('install.installed') });
    };
    window.addEventListener('appinstalled', installedHandler);

    // Popup rapide (4s) si l'événement est disponible
    const promptTimer = setTimeout(() => {
      if (!document.hidden) setShowPrompt(true);
    }, 4000);

    // Fallback : si aucun événement après 8s → instructions manuelles
    const fallbackTimer = setTimeout(() => {
      if (!capturedInstallPrompt) setFallback(true);
      setShowPrompt(true);
    }, 8000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      clearTimeout(promptTimer);
      clearTimeout(fallbackTimer);
    };
  }, [t, toast]);

  if (isInstalled || !showPrompt) return null;

  const canInstall = !!(deferredPrompt || capturedInstallPrompt);

  const handleInstall = async () => {
    const promptEvent = deferredPrompt ?? capturedInstallPrompt;
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      toast({ title: t('install.installed') });
    }
    capturedInstallPrompt = null;
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-4 left-4 right-4 md:bottom-20 md:left-auto md:right-4 md:w-96 z-50"
    >
      <Card className="border-primary/30 bg-background shadow-2xl">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Download className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{t('install.readyToInstall')}</p>
              <p className="text-sm text-muted-foreground">
                {isIOS || fallback ? t('install.manualInstallDescription') : t('install.readyDescription')}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleDismiss}>
              {t('common.later')}
            </Button>
            {canInstall ? (
              <Button className="flex-1" onClick={handleInstall}>
                <Download className="mr-2 h-4 w-4" /> {t('install.installNow')}
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => navigate('/install')}>
                <Download className="mr-2 h-4 w-4" /> {t('install.manualInstall')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAUpdateSystem() {
  return (
    <>
      <UpdateBanner />
      <InstallPrompt />
    </>
  );
}