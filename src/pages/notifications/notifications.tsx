import { useState, useMemo, useEffect, useCallback, memo } from "react"
import { useOpenMember } from "@/hooks/useOpenMember"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { useVersion } from "@/stores/version"
import { useSupabase } from "@/hooks/useSupabase"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { formatDate, displayPhone } from "@/lib/utils"
import { IS_MOCK } from "@/lib/config"
import {
  WaTemplateKey, WA_TEMPLATE_KEYS, DEFAULT_TEMPLATES, sendWhatsApp, toneForStatus, hasActiveSubscription,
} from "@/lib/whatsapp"
import { WhatsAppIcon } from "@/components/ui/whatsapp-button"
import type { WhatsappOutbox } from "@/types/supabase"
import {
  Trash2,
  Settings2, Send, CalendarClock, CalendarX, Loader2, Cake, Search, History, Users, CheckCircle, X, Package,
} from "lucide-react"

type TopTab = "renewals" | "expired" | "birthdays" | "sessions" | "campaign" | "history"
type CampaignStatus = "all" | "active" | "inactive" | "suspended" | "blocked"

interface SubWithRelations {
  id: string
  member_id: string
  end_date: string
  status: "active" | "expired" | "cancelled" | "pending_payment"
  members: { first_name: string; last_name: string; phone: string | null } | null
  subscription_types: { name: string } | null
}

interface CampaignMember {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  status: "active" | "inactive" | "suspended" | "blocked"
  birth_date: string | null
}

interface WaTarget {
  member_id: string
  name: string
  phone: string
  date: string
  kind: WaTemplateKey
}

interface SessionMember {
  id: string
  member_id: string
  member_name: string
  phone: string | null
  session_date: string
  total_sessions: number
}

const DEFAULT_DELAYS = [30, 15, 7, 3, 1, 0]

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function daysUntil(endDate: string): number {
  const today = toDateStr(new Date())
  const [fy, fm, fd] = today.split("-").map(Number)
  const [ty, tm, td] = endDate.split("-").map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

function formatWaDate(dateStr: string): string {
  if (!dateStr) return ""
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(dateStr))
}

function templateLabel(t: (key: string) => string, key: WaTemplateKey): string {
  switch (key) {
    case "renewal": return t("notifications.waRenewal") || "Renouvellement"
    case "expired": return t("notifications.waExpired") || "Expiré"
    case "birthday": return t("notifications.waBirthday") || "Anniversaire"
    case "welcome": return t("notifications.waWelcome") || "Bienvenue"
    case "receipt": return t("notifications.waReceipt") || "Reçu de paiement"
    case "attendance": return t("notifications.waAttendance") || "Visite"
    case "session": return t("notifications.waSession") || "Séance libre"
  }
}

function templateIcon(key: WaTemplateKey): string {
  switch (key) {
    case "renewal": return "⏰"
    case "expired": return "❌"
    case "birthday": return "🎂"
    case "welcome": return "👋"
    case "receipt": return "🧾"
    case "attendance": return "✅"
    case "session": return "🏋️"
  }
}

function outboxStatusLabel(t: (key: string) => string, s: WhatsappOutbox["status"]): string {
  switch (s) {
    case "sent_via_link": return t("notifications.waStatusLink") || "Via lien"
    case "ready": return t("notifications.waStatusReady") || "Prêt"
    case "queued": return t("notifications.waStatusQueued") || "En file"
    case "sent": return t("notifications.waStatusSent") || "Envoyé"
    case "failed": return t("notifications.waStatusFailed") || "Échec"
  }
}

function memberStatusLabel(t: (key: string) => string, s: CampaignMember["status"]): string {
  switch (s) {
    case "active": return t("notifications.statusActive") || "Actifs"
    case "inactive": return t("notifications.statusInactive") || "Inactifs"
    case "suspended": return t("notifications.statusSuspended") || "Suspendus"
    case "blocked": return t("notifications.statusSuspended") || "Bloqué"
  }
}

function memberMatches(name: string, phone: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const nameLower = name.toLowerCase()
  const phoneDigits = phone.replace(/\D/g, "")
  const qDigits = q.replace(/\D/g, "")
  if (nameLower.includes(q) || (qDigits.length > 0 && phoneDigits.includes(qDigits))) return true
  const words = q.split(/\s+/).filter(Boolean)
  return words.every((w) => {
    if (nameLower.includes(w)) return true
    const wDigits = w.replace(/\D/g, "")
    return wDigits.length > 0 && phoneDigits.includes(wDigits)
  })
}

function useSearch(initial = "") {
  const [query, setQuery] = useState(initial)
  // Filtering is live on every keystroke (rows are memoized, so it's cheap).
  // flush() is wired to the 🔍 button / Enter for explicit confirmation.
  const flush = useCallback(() => {
    // no-op: results are already filtered live
  }, [])
  return { query, setQuery, applied: query, flush }
}

function SearchField({
  value,
  onChange,
  onSearch,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onSearch: () => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={className ? `relative ${className}` : "relative"}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch()
        }}
        className="pl-9 pr-20"
        placeholder={placeholder}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8"
          aria-label="Effacer la recherche"
          onClick={() => onChange("")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
        aria-label="Rechercher"
        title="Rechercher"
        onClick={onSearch}
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  )
}

const SubRowCard = memo(function SubRowCard({
  sub,
  isExpired,
  onWhatsApp,
}: {
  sub: SubWithRelations
  isExpired: boolean
  onWhatsApp: (target: WaTarget) => void
}) {
  const t = useT()
  const openMember = useOpenMember()
  const member = sub.members
  const name = member ? `${member.first_name} ${member.last_name}` : "-"
  const phone = member?.phone ?? null
  const subName = sub.subscription_types?.name ?? "-"
  const daysLeft = Math.max(0, daysUntil(sub.end_date))
  const tone = toneForStatus(sub.status)
  const isActive = hasActiveSubscription(sub.status)
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className={`mt-1 rounded-full p-2 ${isExpired ? "bg-destructive/10" : "bg-warning/10"}`}>
            {isExpired
              ? <CalendarX className="h-4 w-4 text-destructive" />
              : <CalendarClock className="h-4 w-4 text-warning" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openMember(sub.member_id)}
                title="Ouvrir la fiche adhérent"
                className="font-medium text-left cursor-pointer hover:text-primary hover:underline transition-colors"
              >
                {name}
              </button>
              {!isExpired && (
                <Badge variant={daysLeft === 0 ? "destructive" : "default"}>{daysLeft} j</Badge>
              )}
              {isExpired && <Badge variant="destructive">{t("notifications.expiredBadge") || "Expiré"}</Badge>}
              {isActive && !isExpired && daysLeft <= 5 && daysLeft > 0 && (
                <Badge variant="outline" className={tone === "amber" ? "border-amber-500 text-amber-600" : "border-green-500 text-green-600"}>
                  {daysLeft <= 1 ? "J-1" : "J-5"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{subName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("notifications.expires") || "Expire le"} : {formatDate(sub.end_date)} · {phone ? displayPhone(phone) : "-"}
            </p>
          </div>
          <Button
              variant="outline"
              size="icon"
              disabled={!phone}
              title={phone ? "WhatsApp" : t("notifications.noPhone") || "Pas de téléphone"}
              onClick={() => phone && onWhatsApp({ member_id: sub.member_id, name, phone, date: sub.end_date, kind: isExpired ? "expired" : "renewal" })}
            >
              <WhatsAppIcon className={`h-4 w-4 ${phone ? `text-${tone === "green" ? "#25d366" : tone === "amber" ? "#f59e0b" : "#ef4444"}` : "text-muted-foreground"}`} />
            </Button>
        </div>
      </CardContent>
    </Card>
  )
})

const BirthdayCard = memo(function BirthdayCard({
  m,
  onWhatsApp,
}: {
  m: CampaignMember
  onWhatsApp: (target: WaTarget) => void
}) {
  const t = useT()
  const openMember = useOpenMember()
  const name = `${m.first_name} ${m.last_name}`
  return (
    <Card className="border-rose-500/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full p-2 bg-rose-500/10">
            <Cake className="h-4 w-4 text-rose-500" />
          </div>
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => openMember(m.id)}
              title="Ouvrir la fiche adhérent"
              className="font-medium text-left cursor-pointer hover:text-primary hover:underline transition-colors"
            >
              {name}
            </button>
            <p className="text-sm text-muted-foreground">{m.phone ? displayPhone(m.phone) : "-"}</p>
            <p className="text-xs text-rose-500">
              {t("notifications.bornOn") || "Né le"} : {formatDate(m.birth_date ?? "")}
            </p>
          </div>
          <Button
              variant="outline"
              size="icon"
              disabled={!m.phone}
              title={m.phone ? "WhatsApp" : t("notifications.noPhone") || "Pas de téléphone"}
              onClick={() => m.phone && onWhatsApp({ member_id: m.id, name, phone: m.phone ?? "", date: m.birth_date ?? "", kind: "birthday" })}
            >
              <WhatsAppIcon className={`h-4 w-4 ${m.phone ? "text-[#25d366]" : "text-muted-foreground"}`} />
            </Button>
        </div>
      </CardContent>
    </Card>
  )
})

const SessionRowCard = memo(function SessionRowCard({
  session,
  onWhatsApp,
}: {
  session: SessionMember
  onWhatsApp: (target: WaTarget) => void
}) {
  const t = useT()
  const openMember = useOpenMember()
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="mt-1 rounded-full p-2 bg-blue-500/10">
            <Package className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openMember(session.member_id)}
                title="Ouvrir la fiche adhérent"
                className="font-medium text-left cursor-pointer hover:text-primary hover:underline transition-colors"
              >
                {session.member_name}
              </button>
              <Badge variant="secondary">{session.total_sessions} {session.total_sessions > 1 ? "séances" : "séance"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {session.phone ? displayPhone(session.phone) : "-"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("notifications.lastSession") || "Dernière séance"} : {formatDate(session.session_date.substring(0, 10))}
            </p>
          </div>
          <Button
              variant="outline"
              size="icon"
              disabled={!session.phone}
              title={session.phone ? "WhatsApp" : t("notifications.noPhone") || "Pas de téléphone"}
              onClick={() => session.phone && onWhatsApp({ member_id: session.member_id, name: session.member_name, phone: session.phone ?? "", date: session.session_date.substring(0, 10), kind: "session" })}
            >
              <WhatsAppIcon className={`h-4 w-4 ${session.phone ? "text-[#25d366]" : "text-muted-foreground"}`} />
            </Button>
        </div>
      </CardContent>
    </Card>
  )
})

const CampaignRow = memo(function CampaignRow({
  m,
  isSelected,
  isAdmin,
  campaignTemplate,
  onToggle,
  onWhatsApp,
  onOpenMember,
}: {
  m: CampaignMember
  isSelected: boolean
  isAdmin: boolean
  campaignTemplate: WaTemplateKey
  onToggle: (id: string) => void
  onWhatsApp: (target: WaTarget) => void
  onOpenMember: (id: string | null | undefined) => void
}) {
  const t = useT()
  const name = `${m.first_name} ${m.last_name}`
  return (
    <tr className="border-b">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(m.id)}
          className="h-4 w-4 accent-[#25d366]"
          aria-label={name}
        />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenMember(m.id)}
          title="Ouvrir la fiche adhérent"
          className="font-medium text-left cursor-pointer hover:text-primary hover:underline transition-colors"
        >
          {name}
        </button>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{m.phone ? displayPhone(m.phone) : "-"}</td>
      <td className="px-4 py-3">
        <Badge variant={m.status === "active" ? "default" : "outline"}>{memberStatusLabel(t, m.status)}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onWhatsApp({ member_id: m.id, name, phone: m.phone ?? "", date: "", kind: campaignTemplate })}
        >
          <WhatsAppIcon className="h-4 w-4 text-[#25d366]" />
        </Button>
      </td>
    </tr>
  )
})

const HistoryRow = memo(function HistoryRow({
  h,
  onDelete,
  onOpenMember,
}: {
  h: WhatsappOutbox
  onDelete: (h: WhatsappOutbox) => void
  onOpenMember: (id: string | null | undefined) => void
}) {
  const t = useT()
  return (
    <tr className="border-b">
      <td className="px-4 py-3 font-medium">
        {h.member_id ? (
          <button
            type="button"
            onClick={() => onOpenMember(h.member_id)}
            title="Ouvrir la fiche adhérent"
            className="text-left font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
          >
            {h.member_name || "-"}
          </button>
        ) : (h.member_name || "-")}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{h.phone ? displayPhone(h.phone) : "-"}</td>
      <td className="px-4 py-3">{templateLabel(t, h.template_key as WaTemplateKey) || h.template_key}</td>
      <td className="px-4 py-3 text-muted-foreground max-w-md">
        <p className="line-clamp-2 whitespace-pre-wrap">{h.message}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant={h.status === "failed" ? "destructive" : h.status === "sent" || h.status === "sent_via_link" ? "default" : "outline"}>
          {outboxStatusLabel(t, h.status)}
        </Badge>
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(h.created_at)}</td>
      <td className="px-4 py-3">
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(h)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  )
})

export default function NotificationsPage() {
  const t = useT()
  const { toast } = useToast()
  const { roles, organization } = useAuth()
  const { localVersion } = useVersion()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const openMember = useOpenMember()
  const [topTab, setTopTab] = useState<TopTab>("renewals")
  const renewalsSearch = useSearch()
  const expiredSearch = useSearch()
  const birthdaySearch = useSearch()
  const sessionSearch = useSearch()
  const historySearch = useSearch()
  const campaignSearch = useSearch()

  const orgId = organization?.id
  const isAdmin = roles?.some((r) => r.role === "admin")

  const { data: delaysSetting } = useQuery({
    queryKey: ["settings", "alert_delays", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return null
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "alert_delays")
        .maybeSingle()
      return (data?.value ?? null) as number[] | null
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const delays = useMemo(() => {
    const v = delaysSetting
    return Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number" && !isNaN(n))
      ? v
      : DEFAULT_DELAYS
  }, [delaysSetting])
  const maxDelay = Math.max(...delays)

  const { data: templatesSetting } = useQuery({
    queryKey: ["settings", "whatsapp_templates", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return null
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "whatsapp_templates")
        .maybeSingle()
      return (data?.value ?? null) as Partial<Record<WaTemplateKey, string>> | null
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const templates = useMemo<Record<WaTemplateKey, string>>(
    () => ({
      renewal: templatesSetting?.renewal || DEFAULT_TEMPLATES.renewal,
      expired: templatesSetting?.expired || DEFAULT_TEMPLATES.expired,
      birthday: templatesSetting?.birthday || DEFAULT_TEMPLATES.birthday,
      welcome: templatesSetting?.welcome || DEFAULT_TEMPLATES.welcome,
      receipt: templatesSetting?.receipt || DEFAULT_TEMPLATES.receipt,
      attendance: templatesSetting?.attendance || DEFAULT_TEMPLATES.attendance,
      session: templatesSetting?.session || DEFAULT_TEMPLATES.session,
    }),
    [templatesSetting],
  )

  const { data: renewals = [], isLoading: renewalsLoading } = useQuery({
    queryKey: ["subscription-renewals", orgId, maxDelay],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const todayStr = toDateStr(new Date())
      const maxDate = new Date()
      maxDate.setDate(maxDate.getDate() + maxDelay)
      const maxDateStr = toDateStr(maxDate)
      const { data, error } = await supabase
        .from("member_subscriptions")
        .select("*, members(first_name,last_name,phone), subscription_types(name)")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .gte("end_date", todayStr)
        .lte("end_date", maxDateStr)
        .order("end_date", { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as SubWithRelations[]
    },
    enabled: !!orgId && !IS_MOCK,
    refetchInterval: 30000,
  })

  const { data: expiredRaw = [], isLoading: expiredLoading } = useQuery({
    queryKey: ["subscription-expired", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const todayStr = toDateStr(new Date())
      const { data, error } = await supabase
        .from("member_subscriptions")
        .select("*, members(first_name,last_name,phone), subscription_types(name)")
        .eq("organization_id", orgId)
        .or(`status.eq.expired,end_date.lt.${todayStr}`)
        .order("end_date", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as SubWithRelations[]
    },
    enabled: !!orgId && !IS_MOCK,
    refetchInterval: 30000,
  })

  const expired = useMemo(() => {
    const map = new Map<string, SubWithRelations>()
    for (const s of expiredRaw) {
      if (!s.member_id) continue
      const cur = map.get(s.member_id)
      if (!cur || new Date(s.end_date).getTime() > new Date(cur.end_date).getTime()) map.set(s.member_id, s)
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime(),
    )
  }, [expiredRaw])

  const { data: members = [] } = useQuery({
    queryKey: ["members", "whatsapp", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, phone, status, birth_date")
        .eq("organization_id", orgId)
        .order("first_name", { ascending: true })
      if (error) throw error
      return (data ?? []) as CampaignMember[]
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const filterSubs = (list: SubWithRelations[], query: string) => {
    return list.filter((s) => {
      const name = s.members ? `${s.members.first_name} ${s.members.last_name}` : ""
      return memberMatches(name, s.members?.phone ?? "", query)
    })
  }

  const searchedRenewals = useMemo(() => filterSubs(renewals, renewalsSearch.applied), [renewals, renewalsSearch.applied])
  const searchedExpired = useMemo(() => filterSubs(expired, expiredSearch.applied), [expired, expiredSearch.applied])

  const birthdays = useMemo(() => {
    const today = new Date()
    const todayStr = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    return members.filter((m: CampaignMember) => {
      if (!m.phone || !m.birth_date || m.birth_date.length < 10) return false
      return m.birth_date.substring(5, 10) === todayStr
    })
  }, [members])

  const searchedBirthdays = useMemo(() => {
    return birthdays.filter((m: CampaignMember) =>
      memberMatches(`${m.first_name} ${m.last_name}`, m.phone ?? "", birthdaySearch.applied),
    )
  }, [birthdays, birthdaySearch.applied])

  const { data: sessionMembers = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["sessions-members", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const { data, error } = await supabase
        .from("pos_transactions")
        .select("id, member_id, created_at, items, members(first_name, last_name, phone, member_number)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200)
      if (error) throw error
      const rows = (data ?? []) as any[]
      const map = new Map<string, SessionMember>()
      for (const row of rows) {
        if (!row.items || !Array.isArray(row.items)) continue
        const hasDropIn = row.items.some((it: any) => typeof it.id === "string" && it.id.startsWith("__dropin__"))
        if (!hasDropIn) continue
        const member = row.members
        if (!member || !member.phone) continue
        if (member.member_number?.startsWith("QLF-VISITEUR")) continue
        const memberId = row.member_id
        const existing = map.get(memberId)
        if (existing) {
          existing.total_sessions++
          if (row.created_at > existing.session_date) existing.session_date = row.created_at
        } else {
          map.set(memberId, {
            id: row.id,
            member_id: memberId,
            member_name: `${member.first_name} ${member.last_name}`,
            phone: member.phone,
            session_date: row.created_at,
            total_sessions: 1,
          })
        }
      }
      return Array.from(map.values()).sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const searchedSessionMembers = useMemo(() => {
    return sessionMembers.filter((s: SessionMember) =>
      memberMatches(s.member_name, s.phone ?? "", sessionSearch.applied),
    )
  }, [sessionMembers, sessionSearch.applied])

  const { data: history = [] } = useQuery({
    queryKey: ["whatsapp-history", orgId],
    queryFn: async () => {
      if (!orgId || IS_MOCK) return []
      const { data, error } = await supabase
        .from("whatsapp_outbox")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as WhatsappOutbox[]
    },
    enabled: !!orgId && !IS_MOCK,
  })

  const [delaysInput, setDelaysInput] = useState(DEFAULT_DELAYS.join(", "))

  useEffect(() => {
    setDelaysInput(delays.join(", "))
  }, [delays])

  const saveDelays = useMutation({
    mutationFn: async (raw: string) => {
      if (!orgId) throw new Error("No organization")
      const parsed = raw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
      if (parsed.length === 0) throw new Error("Invalid delays")
      const { error } = await supabase
        .from("settings")
        .upsert({ organization_id: orgId, key: "alert_delays", value: parsed }, { onConflict: "organization_id,key" })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "alert_delays"] })
      toast({ title: t("notifications.delaysSaved") || "Délais enregistrés" })
    },
    onError: () => {
      toast({ title: t("notifications.delaysError") || "Erreur d'enregistrement", variant: "destructive" })
    },
  })

  const generateAlerts = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization")
      const { data, error } = await (supabase.rpc as any)("generate_expiring_notifications", { p_delays: delays })
      if (error) throw error
      return data as { created: number }
    },
    onSuccess: (data: { created: number }) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      toast({
        title: t("notifications.alertsGenerated") || "Alertes générées",
        description: `${data?.created ?? 0} ${t("notifications.alertsCreated") || "alertes créées"}`,
      })
    },
    onError: () => {
      toast({ title: t("notifications.alertsError") || "Erreur de génération", variant: "destructive" })
    },
  })

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [tplDrafts, setTplDrafts] = useState<Record<WaTemplateKey, string>>({ ...DEFAULT_TEMPLATES })

  useEffect(() => {
    if (templateDialogOpen) setTplDrafts({ ...templates })
  }, [templateDialogOpen, templates])

  const saveTemplates = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization")
      const { error } = await supabase
        .from("settings")
        .upsert({ organization_id: orgId, key: "whatsapp_templates", value: tplDrafts }, { onConflict: "organization_id,key" })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "whatsapp_templates"] })
      setTemplateDialogOpen(false)
      toast({ title: t("notifications.templatesSaved") || "Modèles enregistrés" })
    },
    onError: () => {
      toast({ title: t("notifications.templatesError") || "Erreur d'enregistrement", variant: "destructive" })
    },
  })

  const [waTarget, setWaTarget] = useState<WaTarget | null>(null)
  const [waKey, setWaKey] = useState<WaTemplateKey>("renewal")

  const openWhatsApp = useCallback((target: WaTarget) => {
    setWaKey(target.kind)
    setWaTarget(target)
  }, [])

  function renderWaMessage(name: string, date: string, key: WaTemplateKey): string {
    const tpl = templates[key] || DEFAULT_TEMPLATES[key]
    const salle = organization?.name || "notre salle"
    return tpl
      .replace(/\{NOM\}/g, name)
      .replace(/\{DATE\}/g, formatWaDate(date))
      .replace(/\{NOM_SALLE\}/g, salle)
  }

  const sendWhatsAppDialog = useMutation({
    mutationFn: async () => {
      if (!waTarget) throw new Error("No target")
      const message = renderWaMessage(waTarget.name, waTarget.date, waKey)
      const digits = waTarget.phone.replace(/\D/g, "")
      if (!digits) throw new Error("Invalid phone")
      sendWhatsApp(waTarget.phone, message)
      const { error } = await (supabase.rpc as any)("log_whatsapp_message", {
        p_member_id: waTarget.member_id,
        p_member_name: waTarget.name,
        p_phone: waTarget.phone,
        p_template_key: waKey,
        p_message: message,
        p_status: "sent_via_link",
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-history"] })
      setWaTarget(null)
      toast({ title: t("notifications.waSent") || "Message envoyé" })
    },
    onError: () => {
      toast({ title: t("notifications.waError") || "Erreur d'envoi", variant: "destructive" })
    },
  })

  const [campaignTemplate, setCampaignTemplate] = useState<WaTemplateKey>("renewal")
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>("all")
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [sentCount, setSentCount] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<WhatsappOutbox | null>(null)

  const campaignList = useMemo(() => {
    return members.filter((m: CampaignMember) => {
      if (!m.phone) return false
      if (campaignStatus !== "all" && m.status !== campaignStatus) return false
      return memberMatches(`${m.first_name} ${m.last_name}`, m.phone, campaignSearch.applied)
    })
  }, [members, campaignSearch.applied, campaignStatus])

  const toggleMember = useCallback((id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const requestDelete = useCallback((h: WhatsappOutbox) => {
    setDeleteTarget(h)
  }, [])

  const toggleSelectAll = () => {
    setSelectedMembers((prev) => {
      if (prev.size === campaignList.length) return new Set()
      return new Set(campaignList.map((m: CampaignMember) => m.id))
    })
  }

  const sendCampaign = useMutation({
    mutationFn: async () => {
      const targets = campaignList.filter((m: CampaignMember) => selectedMembers.has(m.id))
      if (targets.length === 0) throw new Error("No targets")
      setSentCount(0)
      for (const m of targets) {
        const message = renderWaMessage(`${m.first_name} ${m.last_name}`, "", campaignTemplate)
        sendWhatsApp(m.phone ?? "", message)
        const { error } = await (supabase.rpc as any)("log_whatsapp_message", {
          p_member_id: m.id,
          p_member_name: `${m.first_name} ${m.last_name}`,
          p_phone: m.phone,
          p_template_key: campaignTemplate,
          p_message: message,
          p_status: "sent_via_link",
        })
        if (error) throw error
        setSentCount((c) => c + 1)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-history"] })
      setSelectedMembers(new Set())
      toast({ title: t("notifications.waSent") || "Message envoyé" })
    },
    onError: () => {
      toast({ title: t("notifications.waError") || "Erreur d'envoi", variant: "destructive" })
    },
  })

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.rpc as any)("delete_whatsapp_message", { p_message_id: id })
      if (error) throw error
      return data as boolean
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-history"] })
      setDeleteTarget(null)
      toast({ title: t("notifications.waDeleted") || "Message supprimé" })
    },
    onError: () => {
      toast({ title: t("notifications.waDeleteError") || "Erreur de suppression", variant: "destructive" })
    },
  })

  const filteredHistory = useMemo(() => {
    const q = historySearch.applied.trim().toLowerCase()
    if (!q) return history
    return history.filter((h: WhatsappOutbox) => {
      const name = (h.member_name ?? "").toLowerCase()
      const digits = (h.phone ?? "").replace(/\D/g, "")
      const tpl = (templateLabel(t, h.template_key as WaTemplateKey) || h.template_key).toLowerCase()
      const msg = (h.message ?? "").toLowerCase()
      return name.includes(q) || digits.includes(q.replace(/\D/g, "")) || tpl.includes(q) || msg.includes(q)
    })
  }, [history, historySearch.applied, t])

  return (
    <div>
      <div className="h-1.5 w-full rounded-full bg-[#25D366] mb-4 dark:bg-primary" />
      <PageHeader title={t("notifications.description")} />
      <div className="mb-3 flex items-center gap-2">
        <Badge variant="outline" className="text-xs text-muted-foreground">
          v{localVersion.version} · {localVersion.commitSha.slice(0, 7)}
        </Badge>
      </div>

      <Tabs value={topTab} onValueChange={(v) => setTopTab(v as TopTab)}>
        <TabsList>
          <TabsTrigger value="renewals">{t("notifications.renewals") || "Renouvellements"}</TabsTrigger>
          <TabsTrigger value="expired">{t("notifications.expired") || "Expirés"}</TabsTrigger>
          <TabsTrigger value="birthdays">{t("notifications.birthdays") || "Anniversaires"}</TabsTrigger>
          <TabsTrigger value="sessions">{t("notifications.sessions") || "Séances libres"}</TabsTrigger>
          <TabsTrigger value="campaign">{t("notifications.campaign") || "Campagne WhatsApp"}</TabsTrigger>
          <TabsTrigger value="history">{t("notifications.history") || "Historique"}</TabsTrigger>
        </TabsList>

        <TabsContent value="renewals">
          <div className="space-y-4">
            {isAdmin && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t("notifications.delaysTitle") || "Délais d'alerte"}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      value={delaysInput}
                      onChange={(e) => setDelaysInput(e.target.value)}
                      className="max-w-xs"
                      placeholder="30, 15, 7, 3, 1, 0"
                    />
                    <Button onClick={() => saveDelays.mutate(delaysInput)} disabled={saveDelays.isPending}>
                      {saveDelays.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("notifications.save") || "Enregistrer"}
                    </Button>
                    <Button onClick={() => generateAlerts.mutate()} disabled={generateAlerts.isPending}>
                      {generateAlerts.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("notifications.generateAlerts") || "Générer les alertes"}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setTemplateDialogOpen(true)}>
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <h3 className="text-lg font-semibold">{t("notifications.expiringSoon") || "Abonnements expirant bientôt"}</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <SearchField
                value={renewalsSearch.query}
                onChange={renewalsSearch.setQuery}
                onSearch={renewalsSearch.flush}
                placeholder={t("notifications.searchMember") || "Rechercher un membre..."}
                className="max-w-xs"
              />
              {renewals.length > 0 && (
                <Badge variant="outline" className="shrink-0 text-xs">{searchedRenewals.length} / {renewals.length}</Badge>
              )}
            </div>
            {renewalsLoading ? (
              <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
            ) : searchedRenewals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>{renewalsSearch.query
                  ? t("notifications.noResult") || "Aucun membre ne correspond à la recherche"
                  : t("notifications.noRenewals") || "Aucun abonnement à renouveler"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchedRenewals.map((s: SubWithRelations) => (
                  <SubRowCard key={s.id} sub={s} isExpired={false} onWhatsApp={openWhatsApp} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="expired">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{t("notifications.expiredSubs") || "Abonnements expirés"}</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <SearchField
                value={expiredSearch.query}
                onChange={expiredSearch.setQuery}
                onSearch={expiredSearch.flush}
                placeholder={t("notifications.searchMember") || "Rechercher un membre..."}
                className="max-w-xs"
              />
              {expired.length > 0 && (
                <Badge variant="outline" className="shrink-0 text-xs">{searchedExpired.length} / {expired.length}</Badge>
              )}
            </div>
            {expiredLoading ? (
              <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
            ) : searchedExpired.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarX className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>{expiredSearch.query
                  ? t("notifications.noResult") || "Aucun membre ne correspond à la recherche"
                  : t("notifications.noExpired") || "Aucun abonnement expiré"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchedExpired.map((s: SubWithRelations) => (
                  <SubRowCard key={s.id} sub={s} isExpired onWhatsApp={openWhatsApp} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="birthdays">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{t("notifications.birthdayTitle") || "Anniversaires aujourd'hui"}</h3>
              {birthdays.length > 0 && <Badge variant="default">{birthdays.length}</Badge>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <SearchField
                value={birthdaySearch.query}
                onChange={birthdaySearch.setQuery}
                onSearch={birthdaySearch.flush}
                placeholder={t("notifications.searchMember") || "Rechercher un membre..."}
                className="max-w-xs"
              />
              {birthdays.length > 0 && (
                <Badge variant="outline" className="shrink-0 text-xs">{searchedBirthdays.length} / {birthdays.length}</Badge>
              )}
            </div>
            {birthdays.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Cake className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>{t("notifications.noBirthdays") || "Aucun anniversaire aujourd'hui"}</p>
              </div>
            ) : searchedBirthdays.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Cake className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>{t("notifications.noResult") || "Aucun membre ne correspond à la recherche"}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchedBirthdays.map((m: CampaignMember) => (
                  <BirthdayCard key={m.id} m={m} onWhatsApp={openWhatsApp} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sessions">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{t("notifications.sessionsTitle") || "Séances libres récentes"}</h3>
              {sessionMembers.length > 0 && <Badge variant="default">{sessionMembers.length}</Badge>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <SearchField
                value={sessionSearch.query}
                onChange={sessionSearch.setQuery}
                onSearch={sessionSearch.flush}
                placeholder={t("notifications.searchMember") || "Rechercher un membre..."}
                className="max-w-xs"
              />
              {sessionMembers.length > 0 && (
                <Badge variant="outline" className="shrink-0 text-xs">{searchedSessionMembers.length} / {sessionMembers.length}</Badge>
              )}
            </div>
            {sessionsLoading ? (
              <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
            ) : searchedSessionMembers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>{sessionSearch.query
                  ? t("notifications.noResult") || "Aucun membre ne correspond à la recherche"
                  : t("notifications.noSessions") || "Aucune séance libre récente"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchedSessionMembers.map((s: SessionMember) => (
                  <SessionRowCard key={s.id} session={s} onWhatsApp={openWhatsApp} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="campaign">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{t("notifications.campaign") || "Campagne WhatsApp"}</h3>
                  <p className="text-sm text-muted-foreground">{t("notifications.campaignDesc") || "Envoyez des messages personnalisés à vos adhérents"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {WA_TEMPLATE_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setCampaignTemplate(key)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      campaignTemplate === key
                        ? "border-[#25d366]/50 bg-[#25d366]/10"
                        : "bg-background border-border hover:border-[#25d366]/40"
                    }`}
                  >
                    <span className="text-2xl">{templateIcon(key)}</span>
                    <h4 className="text-sm font-semibold mt-2">{templateLabel(t, key)}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{templates[key]}</p>
                  </button>
                ))}
              </div>

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <WhatsAppIcon className="h-4 w-4 text-[#25d366]" />
                    <span className="text-sm text-muted-foreground">{t("notifications.templatePreview") || "Aperçu du message"}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap bg-background rounded-lg p-3">
                    {renderWaMessage("[Prénom Nom]", new Date().toISOString().substring(0, 10), campaignTemplate)}
                  </p>
                </CardContent>
              </Card>

              <div className="flex items-center gap-3 flex-wrap">
                <SearchField
                  value={campaignSearch.query}
                  onChange={campaignSearch.setQuery}
                  onSearch={campaignSearch.flush}
                  placeholder={t("notifications.searchMember") || "Rechercher un membre..."}
                  className="flex-1 min-w-[220px] max-w-xs"
                />
                <Badge variant="outline" className="shrink-0 text-xs">
                  {campaignList.length} / {members.filter((m: CampaignMember) => m.phone).length}
                </Badge>
                {(["all", "active", "inactive", "suspended"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={campaignStatus === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCampaignStatus(s)}
                  >
                    {s === "all" ? t("notifications.all") : memberStatusLabel(t, s)}
                  </Button>
                ))}
              </div>

              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={campaignList.length > 0 && selectedMembers.size === campaignList.length}
                            onChange={toggleSelectAll}
                            className="h-4 w-4 accent-[#25d366]"
                            aria-label="Select all"
                          />
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.member") || "Membre"}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.phone") || "Téléphone"}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.status") || "Statut"}</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("notifications.waTemplate") || "Modèle"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <p>{campaignSearch.query
                              ? t("notifications.noResult") || "Aucun membre ne correspond à la recherche"
                              : t("notifications.noMemberPhone") || "Aucun membre avec numéro de téléphone"}</p>
                          </td>
                        </tr>
                      ) : (
                        campaignList.map((m: CampaignMember) => (
                          <CampaignRow
                            key={m.id}
                            m={m}
                            isSelected={selectedMembers.has(m.id)}
                            isAdmin={isAdmin}
                            campaignTemplate={campaignTemplate}
                            onToggle={toggleMember}
                            onWhatsApp={openWhatsApp}
                            onOpenMember={openMember}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {selectedMembers.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                  <div className="flex items-center gap-4 rounded-xl border border-[#25d366]/40 bg-background/95 px-6 py-3 shadow-2xl backdrop-blur">
                    <CheckCircle className="h-5 w-5 text-[#25d366]" />
                    <span className="text-sm">
                      {sendCampaign.isPending
                        ? `${t("notifications.sendingInProgress") || "Envoi en cours..."} (${sentCount}/${selectedMembers.size})`
                        : t("notifications.selectedMembers")?.replace("{n}", String(selectedMembers.size)) || `${selectedMembers.size} membre(s) sélectionné(s)`}
                    </span>
                    <Button
                      onClick={() => sendCampaign.mutate()}
                      disabled={sendCampaign.isPending}
                      className="bg-gradient-to-br from-[#25d366] via-[#1eb457] to-[#128c7e] text-white hover:from-[#1eb457] hover:via-[#128c7e] hover:to-[#075e54]"
                    >
                      {sendCampaign.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      {t("notifications.sendToAll") || "Envoyer à tous"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

        {isAdmin && (
          <TabsContent value="history">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{t("notifications.historyTitle") || "Historique des envois WhatsApp"}</h3>
                  <p className="text-sm text-muted-foreground">{t("notifications.historyDesc") || "Consultez les messages envoyés via WhatsApp"}</p>
                </div>
                {history.length > 0 && (
                  <Badge variant="outline" className="ml-auto shrink-0">{filteredHistory.length} / {history.length}</Badge>
                )}
              </div>
              <SearchField
                value={historySearch.query}
                onChange={historySearch.setQuery}
                onSearch={historySearch.flush}
                placeholder={t("notifications.searchMember") || "Rechercher un membre..."}
                className="max-w-sm"
              />
              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>{historySearch.query ? t("notifications.noResult") || "Aucun message ne correspond à la recherche" : t("notifications.historyEmpty") || "Aucun message envoyé"}</p>
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.member") || "Membre"}</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.phone") || "Téléphone"}</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.waTemplate") || "Modèle"}</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.message") || "Message"}</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.status") || "Statut"}</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("notifications.date") || "Date"}</th>
                          <th className="w-12 px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.map((h: WhatsappOutbox) => (
                          <HistoryRow key={h.id} h={h} onDelete={requestDelete} onOpenMember={openMember} />
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("notifications.waTemplates") || "Modèles WhatsApp"}</DialogTitle>
            <DialogDescription>
              {t("notifications.waTemplatesDesc") || "Personnalisez les messages envoyés aux membres. Variables : {NOM}, {DATE}, {NOM_SALLE}."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {WA_TEMPLATE_KEYS.map((key) => (
              <div key={key} className="space-y-2">
                <Label>{templateLabel(t, key)}</Label>
                <Textarea
                  value={tplDrafts[key]}
                  onChange={(e) => setTplDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                  rows={3}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              {t("notifications.cancel") || "Annuler"}
            </Button>
            <Button onClick={() => saveTemplates.mutate()} disabled={saveTemplates.isPending}>
              {saveTemplates.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("notifications.save") || "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!waTarget} onOpenChange={(o) => { if (!o) setWaTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("notifications.waPreview") || "Envoyer sur WhatsApp"}</DialogTitle>
            <DialogDescription>
              {waTarget ? `${waTarget.name} · ${displayPhone(waTarget.phone)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {waTarget && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("notifications.waTemplate") || "Modèle"}</Label>
                <Select value={waKey} onValueChange={(v) => setWaKey(v as WaTemplateKey)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WA_TEMPLATE_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>{templateLabel(t, key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Card className="bg-muted">
                <CardContent className="p-3">
                  <p className="text-sm whitespace-pre-wrap">{renderWaMessage(waTarget.name, waTarget.date, waKey)}</p>
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaTarget(null)}>
              {t("notifications.cancel") || "Annuler"}
            </Button>
            <Button onClick={() => sendWhatsAppDialog.mutate()} disabled={sendWhatsAppDialog.isPending}>
              {sendWhatsAppDialog.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t("notifications.send") || "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("notifications.waDeleteConfirm") || "Supprimer ce message ?"}</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `${deleteTarget.member_name || "-"} · ${deleteTarget.phone ? displayPhone(deleteTarget.phone) : "-"}` : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <Card className="bg-muted">
              <CardContent className="p-3">
                <p className="text-sm whitespace-pre-wrap line-clamp-3">{deleteTarget.message}</p>
              </CardContent>
            </Card>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("notifications.cancel") || "Annuler"}
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMessage.mutate(deleteTarget.id)} disabled={deleteMessage.isPending}>
              {deleteMessage.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("notifications.delete") || "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
