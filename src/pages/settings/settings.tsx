import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/toast"
import { useT, useLocale } from "@/i18n"
import { useTheme } from "@/stores/theme"
import { useAuth } from "@/stores/auth"
import { useSupabase } from "@/hooks/useSupabase"
import { useMutation } from "@/hooks/useQuery"
import { Save, Building2, Globe, Palette, Bell, Loader2, Info, Github, Calendar, Hash } from "lucide-react"
import { useVersion } from "@/stores/version"

const settingsSchema = z.object({
  gym_name: z.string().min(1, "Gym name is required"),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  currency: z.string().min(1, "Currency is required"),
  language: z.string().min(1, "Language is required"),
  notifications_enabled: z.boolean(),
  email_notifications: z.boolean(),
  sms_notifications: z.boolean(),
})

type SettingsForm = z.infer<typeof settingsSchema>

export default function SettingsPage() {
  const t = useT()
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const { organization } = useAuth()
  const supabase = useSupabase()
  const { localVersion } = useVersion()

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      gym_name: "FitManager Alger Centre",
      address: "123 Rue Didouche Mourad, Alger",
      phone: "+213 21 123 456",
      email: "contact@fitmanager.dz",
      currency: "DZD",
      language: locale,
      notifications_enabled: true,
      email_notifications: true,
      sms_notifications: false,
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const orgId = organization?.id
      if (!orgId) throw new Error("No organization")

      const entries: [string, string][] = [
        ["gym_name", data.gym_name],
        ["address", data.address ?? ""],
        ["phone", data.phone ?? ""],
        ["email", data.email ?? ""],
        ["currency", data.currency],
        ["language", data.language],
        ["notifications_enabled", String(data.notifications_enabled)],
        ["email_notifications", String(data.email_notifications)],
        ["sms_notifications", String(data.sms_notifications)],
      ]

      for (const [key, value] of entries) {
        const { error } = await supabase
          .from("settings")
          .upsert(
            { organization_id: orgId, key, value },
            { onConflict: "organization_id,key" },
          )
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast({ title: t("settings.saved"), description: t("settings.savedDescription") })
    },
    onError: () => {
      toast({
        title: t("settings.error"),
        description: t("settings.errorDescription"),
        variant: "destructive",
      })
    },
  })

  function onSubmit(data: SettingsForm) {
    saveMutation.mutate(data)
  }

  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> {t("settings.gymInfo")}
            </CardTitle>
            <CardDescription>{t("settings.gymInfoDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="gym_name" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.gymName")}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.address")}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.phone")}</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.email")}</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" /> {t("settings.localization")}
            </CardTitle>
            <CardDescription>{t("settings.localizationDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="language" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.language")}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={(v) => { field.onChange(v); setLocale(v) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="ar">العربية</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="currency" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.currency")}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DZD">DZD - Algerian Dinar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" /> {t("settings.appearance")}
            </CardTitle>
            <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("settings.theme")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.themeDescription")}</p>
              </div>
              <Select value={theme} onValueChange={(v) => setTheme(v as "light" | "dark")}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t("settings.light")}</SelectItem>
                  <SelectItem value="dark">{t("settings.dark")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> {t("settings.notifications")}
            </CardTitle>
            <CardDescription>{t("settings.notificationsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="notifications_enabled" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div>
                    <FormLabel>{t("settings.pushNotifications")}</FormLabel>
                    <p className="text-sm text-muted-foreground">{t("settings.pushNotificationsDescription")}</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
              </FormItem>
            )} />
            <Separator />
            <FormField control={form.control} name="email_notifications" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div>
                    <FormLabel>{t("settings.emailNotifications")}</FormLabel>
                    <p className="text-sm text-muted-foreground">{t("settings.emailNotificationsDescription")}</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
              </FormItem>
            )} />
            <Separator />
            <FormField control={form.control} name="sms_notifications" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div>
                    <FormLabel>{t("settings.smsNotifications")}</FormLabel>
                    <p className="text-sm text-muted-foreground">{t("settings.smsNotificationsDescription")}</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
              </FormItem>
            )} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" /> {t("settings.about")}
            </CardTitle>
            <CardDescription>{t("settings.aboutDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Hash className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Fitmanager Pro Dz</h3>
                <p className="text-sm text-muted-foreground">{t("settings.version")} {localVersion.version}</p>
                <p className="text-sm text-muted-foreground">{t("settings.build")} {localVersion.build}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-4 w-4 shrink-0" />
                <span>{t("settings.buildId")}: {localVersion.buildId}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>{t("settings.buildDate")}: {new Date(localVersion.buildDate).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Github className="h-4 w-4 shrink-0" />
                <span>{t("settings.commit")}: {localVersion.commitSha.slice(0, 7)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <span>{t("settings.minSupported")}: {localVersion.minSupportedVersion}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}{" "}
          {t("settings.saveSettings")}
        </Button>
      </form>
      </Form>
    </div>
  )
}
