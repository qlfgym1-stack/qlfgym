import { useState, useMemo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { usePagination } from "@/hooks/usePagination"
import { useExportCsv } from "@/hooks/useExportCsv"
import { formatCurrency, toUpper } from "@/lib/utils"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Pagination } from "@/components/ui/pagination"
import { Loader2, Wallet, Search, Download, Pencil, Trash2, History, CreditCard, RefreshCw, Ticket, Package } from "lucide-react"
import { IS_MOCK } from "@/lib/config"
import { useToast } from "@/components/ui/toast"
import { useOpenMember } from "@/hooks/useOpenMember"
import type { PaymentChange, Member } from "@/types/supabase"
import { buildSubscriptionKeys, paymentDedupeKey } from "@/lib/ledger-dedupe"

interface EncaissementRow {
  id: string
  type: "subscription" | "pos"
  detailType: "subscription" | "renewal" | "dropin" | "product"
  description: string
  amount: number
  date: string
  method: string
  status: string
  memberId: string | null
  memberName: string
  isVirtualSubscription?: boolean
}

function getTopRole(roles: { role: string }[]): string {
  if (roles.some(r => r.role === 'admin')) return 'admin'
  if (roles.some(r => r.role === 'receptionist')) return 'reception'
  if (roles.some(r => r.role === 'cleaner')) return 'cleaner'
  if (roles.some(r => r.role === 'staff')) return 'staff'
  if (roles.some(r => r.role === 'coach')) return 'coach'
  return 'admin'
}

function dedupeRows(subs: EncaissementRow[], posRows: EncaissementRow[]): EncaissementRow[] {
  const keys = buildSubscriptionKeys(subs)
  const filtered = posRows.filter(p => {
    if (!p.isVirtualSubscription || !p.memberId) return true
    const k = paymentDedupeKey(p.memberId, p.amount, p.date)
    return k === null || !keys.has(k)
  })
  return [...subs, ...filtered]
}

export default function Encaissement() {
  const supabase = useSupabase()
  const t = useT()
  const openMember = useOpenMember()
  const { organization, roles } = useAuth()
  const orgId = organization?.id
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const topRole = getTopRole(roles ?? [])
  const canManage = topRole === 'admin' || topRole === 'reception'

  const today = new Date().toISOString().split("T")[0]
  const monthStart = new Date()
  monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().split("T")[0]

  const [dateFrom, setDateFrom] = useState(monthStartStr)
  const [dateTo, setDateTo] = useState(today)
  const [methodFilter, setMethodFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const [modifyRow, setModifyRow] = useState<EncaissementRow | null>(null)
  const [cancelRow, setCancelRow] = useState<EncaissementRow | null>(null)
  const [historyRow, setHistoryRow] = useState<EncaissementRow | null>(null)
  const [modifyAmount, setModifyAmount] = useState("")
  const [modifyDate, setModifyDate] = useState("")
  const [modifyMethod, setModifyMethod] = useState("cash")
  const [modifyReason, setModifyReason] = useState("")
  const [cancelReason, setCancelReason] = useState("")

  const { data: members } = useQuery({
    queryKey: ["members_minimal"],
    queryFn: async () => {
      if (IS_MOCK || !orgId) return []
      const { data } = await supabase.from("members").select("id, first_name, last_name, phone, member_number").eq("organization_id", orgId).eq("status", "active").order("first_name")
      return data ?? []
    },
    enabled: !!orgId,
  })

  const filteredMembers = useMemo(() => {
    if (!members) return []
    return members.filter((m: Pick<Member, "id" | "first_name" | "last_name" | "phone" | "member_number">) =>
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.phone && m.phone.includes(memberSearch))
    )
  }, [members, memberSearch])

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["encaissement", orgId, dateFrom, dateTo],
    queryFn: async () => {
      if (IS_MOCK || !orgId) return []
      const [y, m, d] = dateTo.split("-").map(Number)
      const dateToEnd = new Date(y, m - 1, d + 1)
      const dateToEndStr = `${dateToEnd.getFullYear()}-${String(dateToEnd.getMonth() + 1).padStart(2, "0")}-${String(dateToEnd.getDate()).padStart(2, "0")}`
      const [paymentsRes, posRes] = await Promise.all([
        supabase.from("payments").select("id, amount, payment_date, payment_method, status, member_id, member_subscriptions!inner(subscription_types(name)), members(first_name, last_name)").eq("organization_id", orgId).eq("status", "completed").gte("payment_date", dateFrom).lt("payment_date", dateToEndStr).order("payment_date", { ascending: false }),
        supabase.from("pos_transactions").select("id, total, created_at, payment_method, payment_status, member_id, items, members(first_name, last_name)").eq("organization_id", orgId).eq("payment_status", "completed").gte("created_at", dateFrom).lt("created_at", dateToEndStr).order("created_at", { ascending: false }),
      ])
      if (paymentsRes.error) throw paymentsRes.error
      if (posRes.error) throw posRes.error
      const payments = paymentsRes.data
      const pos = posRes.data
      const subs: EncaissementRow[] = ((payments ?? []) as any[]).map(p => {
        const subName = p.member_subscriptions?.subscription_types?.name ?? null
        return {
          id: p.id,
          type: "subscription" as const,
          detailType: "subscription" as const,
          description: subName ?? "-",
          amount: Number(p.amount) || 0,
          date: p.payment_date,
          method: p.payment_method,
          status: p.status,
          memberId: p.member_id,
          memberName: p.members ? `${toUpper(p.members.first_name)} ${toUpper(p.members.last_name)}` : "-",
        }
      })
      const posRows: EncaissementRow[] = ((pos ?? []) as any[]).map(p => {
        const items = (p.items ?? []) as any[]
        let detailType: "subscription" | "renewal" | "dropin" | "product" = "product"
        let description = ""
        const hasSub = items.some((it: any) => it.id?.startsWith?.("__subscription__"))
        const hasRenewal = items.some((it: any) => it.id?.startsWith?.("__renewal__"))
        const hasDropin = items.some((it: any) => it.id?.startsWith?.("__dropin__"))
        if (hasSub) {
          detailType = "subscription"
          const subItem = items.find((it: any) => it.id?.startsWith?.("__subscription__"))
          description = subItem?.name ?? "Abonnement"
        } else if (hasRenewal) {
          detailType = "renewal"
          const renewItem = items.find((it: any) => it.id?.startsWith?.("__renewal__"))
          description = renewItem?.name ?? "Renouvellement"
        } else if (hasDropin) {
          detailType = "dropin"
          const dropItem = items.find((it: any) => it.id?.startsWith?.("__dropin__"))
          description = dropItem?.name ?? "Séance libre"
        } else {
          detailType = "product"
          const physicalItems = items.filter((it: any) => !it.id?.startsWith?.("__"))
          if (physicalItems.length === 1) {
            description = physicalItems[0].name ?? "-"
          } else if (physicalItems.length > 1) {
            description = physicalItems.map((it: any) => `${it.name}${(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ""}`).join(", ")
          } else {
            description = "-"
          }
        }
        return {
          id: p.id,
          type: "pos" as const,
          detailType,
          description,
          amount: Number(p.total) || 0,
          date: p.created_at,
          method: p.payment_method ?? "cash",
          status: "completed",
          memberId: p.member_id,
          memberName: p.members ? `${toUpper(p.members.first_name)} ${toUpper(p.members.last_name)}` : "-",
          isVirtualSubscription: hasSub || hasRenewal,
        }
      })
      const deduped = dedupeRows(subs, posRows)
      return [...deduped].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    },
    enabled: !!orgId,
  })

  const { data: historyData } = useQuery({
    queryKey: ["payment_changes", orgId, historyRow?.type, historyRow?.id],
    queryFn: async () => {
      if (IS_MOCK || !orgId || !historyRow) return []
      let q = supabase
        .from("payment_changes")
        .select("*")
        .eq("organization_id", orgId)
      if (historyRow.type === "subscription") {
        q = q.eq("payment_id", historyRow.id)
      } else {
        q = q.eq("pos_transaction_id", historyRow.id)
      }
      const { data, error } = await q.order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as PaymentChange[]
    },
    enabled: !!orgId && !!historyRow,
  })

  const filtered = useMemo(() => {
    if (!rawData) return []
    return rawData.filter((r: EncaissementRow) => {
      if (methodFilter !== "all" && r.method !== methodFilter) return false
      if (typeFilter !== "all") {
        if (typeFilter === "subscription" && r.detailType !== "subscription") return false
        if (typeFilter === "renewal" && r.detailType !== "renewal") return false
        if (typeFilter === "dropin" && r.detailType !== "dropin") return false
        if (typeFilter === "product" && r.detailType !== "product") return false
      }
      if (selectedMemberId && r.memberId !== selectedMemberId) return false
      return true
    })
  }, [rawData, methodFilter, typeFilter, selectedMemberId])

  const { page, setPage, totalPages, paginatedData } = usePagination(filtered, 20)

  const periodTotals = useMemo(() => {
    const raw = rawData ?? []
    const now_ = new Date()
    const todayStr = now_.toISOString().split("T")[0]
    const weekStart_ = new Date(now_)
    weekStart_.setDate(now_.getDate() - ((now_.getDay() + 6) % 7))
    const monthStart_ = new Date(now_.getFullYear(), now_.getMonth(), 1)
    let todayTotal = 0, todayCount = 0, weekTotal = 0, weekCount = 0, monthTotal = 0, monthCount = 0
    for (const r of raw) {
      const d = new Date(r.date)
      if (d >= monthStart_) { monthTotal += r.amount; monthCount++ }
      if (d >= weekStart_) { weekTotal += r.amount; weekCount++ }
      if (d.toISOString().split("T")[0] === todayStr) { todayTotal += r.amount; todayCount++ }
    }
    return { todayTotal, todayCount, weekTotal, weekCount, monthTotal, monthCount }
  }, [rawData])

  const totals = useMemo(() => {
    return { total: filtered.reduce((s: number, r: EncaissementRow) => s + r.amount, 0), count: filtered.length }
  }, [filtered])

  const handleExport = useCallback(() => {
    const exportData = filtered.map((r: EncaissementRow) => ({
      date: new Date(r.date).toLocaleDateString("fr-FR"),
      type: r.detailType === "subscription" ? (t("encaissement.subscription") || "Abonnement") : r.detailType === "renewal" ? (t("encaissement.renewal") || "Renouvellement") : r.detailType === "dropin" ? (t("encaissement.dropin") || "Séance libre") : (t("encaissement.product") || "Produit"),
      detail: r.description,
      member: r.memberName,
      amount: r.amount,
      method: r.method,
      status: r.status === "completed" ? (t("encaissement.completed") || "Complété") : r.status === "pending" ? (t("encaissement.pending") || "En attente") : (t("encaissement.cancelled") || "Annulé"),
    }))
    return { exportData }
  }, [filtered, t])

  const { exportCsv } = useExportCsv<Record<string, unknown>>(
    handleExport().exportData as unknown as Record<string, unknown>[],
    "encaissements",
    [
      { key: "date", label: t("encaissement.date") || "Date" },
      { key: "type", label: t("encaissement.type") || "Type" },
      { key: "detail", label: t("encaissement.detail") || "Détail" },
      { key: "member", label: t("pos.member") || "Membre" },
      { key: "amount", label: t("payments.amount") || "Montant" },
      { key: "method", label: t("encaissement.method") || "Moyen" },
      { key: "status", label: t("encaissement.status") || "Statut" },
    ]
  )

  const methodBadge = (method: string) => {
    const map: Record<string, string> = {
      cash: "default", card: "secondary", transfer: "outline", other: "destructive",
    }
    return (
      <Badge variant={(map[method] as any) || "outline"}>
        {method === "cash" ? t("encaissement.cash") : method === "card" ? t("encaissement.card") : method === "transfer" ? t("encaissement.transfer") : t("encaissement.other")}
      </Badge>
    )
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: "default", pending: "secondary", cancelled: "destructive",
    }
    return (
      <Badge variant={(map[status] as any) || "outline"}>
        {status === "completed" ? t("encaissement.completed") : status === "pending" ? t("encaissement.pending") : t("encaissement.cancelled")}
      </Badge>
    )
  }

  const openModify = (row: EncaissementRow) => {
    setModifyRow(row)
    setModifyAmount(String(row.amount))
    setModifyDate(row.date.slice(0, 10))
    setModifyMethod(row.method === "cash" || row.method === "card" || row.method === "transfer" || row.method === "other" ? row.method : "cash")
    setModifyReason("")
  }

  const modifyMutation = useMutation({
    mutationFn: async () => {
      if (!modifyRow) throw new Error("No row")
      if (IS_MOCK) return
      const { error } = await (supabase.rpc as any)("modify_payment", {
        p_payment_id: modifyRow.id,
        p_new_amount: Number(modifyAmount),
        p_new_date: new Date(`${modifyDate}T12:00:00`).toISOString(),
        p_new_method: modifyMethod,
        p_reason: modifyReason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encaissement", orgId] })
      setModifyRow(null)
      setModifyReason("")
      toast({ title: t("encaissement.modifySuccess"), variant: "success" })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!cancelRow) throw new Error("No row")
      if (IS_MOCK) return
      const { error } = cancelRow.type === "subscription"
        ? await (supabase.rpc as any)("cancel_payment", { p_payment_id: cancelRow.id, p_reason: cancelReason })
        : await (supabase.rpc as any)("cancel_pos_transaction", { p_transaction_id: cancelRow.id, p_reason: cancelReason })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encaissement", orgId] })
      queryClient.invalidateQueries({ queryKey: ["products"] })
      setCancelRow(null)
      setCancelReason("")
      toast({ title: t("encaissement.cancelSuccess"), variant: "success" })
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" })
    },
  })

  const renderOldNew = (c: PaymentChange) => {
    const oldD = (c.old_data ?? {}) as Record<string, unknown>
    const newD = (c.new_data ?? {}) as Record<string, unknown>
    const fmtVal = (v: unknown) => {
      if (v === null || v === undefined) return "-"
      if (typeof v === "number") return formatCurrency(v)
      if (typeof v === "object") return JSON.stringify(v)
      return String(v)
    }
    const keys = Object.keys({ ...oldD, ...newD }).filter(k => k !== "items")
    return (
      <div className="space-y-1">
        {keys.map(k => {
          const o = oldD[k]
          const n = newD[k]
          if (o === n) return null
          return (
            <div key={k} className="text-xs">
              <span className="text-muted-foreground">{k} :</span>{" "}
              {o !== undefined && <span className="line-through text-destructive">{fmtVal(o)}</span>}
              {o !== undefined && n !== undefined && <span className="mx-1">→</span>}
              <span className="font-medium">{fmtVal(n)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const KpiCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <Card className="border border-border/50 shadow-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="rounded-lg p-2.5 shrink-0 bg-[#06b6d415]">
          <Wallet className="h-5 w-5" style={{ color: "#06b6d4" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="h-1.5 w-full rounded-full bg-[#f59e0b] mb-4 dark:bg-primary" />
      <PageHeader
        title={t("encaissement.title") || "Encaissements"}
        description={t("encaissement.description") || "Suivi des encaissements et ventes"}
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t("encaissement.export") || "Exporter"}
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3">
        <KpiCard label={t("encaissement.today") || "Aujourd'hui"} value={formatCurrency(periodTotals.todayTotal)} sub={`${periodTotals.todayCount} ${t("encaissement.transactionCount") || "transactions"}`} />
        <KpiCard label={t("encaissement.thisWeek") || "Cette semaine"} value={formatCurrency(periodTotals.weekTotal)} sub={`${periodTotals.weekCount} ${t("encaissement.transactionCount") || "transactions"}`} />
        <KpiCard label={t("encaissement.thisMonth") || "Ce mois"} value={formatCurrency(periodTotals.monthTotal)} sub={`${periodTotals.monthCount} ${t("encaissement.transactionCount") || "transactions"}`} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.dateFrom") || "Du"}</label>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.dateTo") || "Au"}</label>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("pos.member") || "Membre"}</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={t("pos.searchMember") || "Rechercher..."}
                  value={memberSearch}
                  onChange={e => { setMemberSearch(e.target.value); setSelectedMemberId(null); setPage(0) }}
                  className="pl-7 h-9 text-sm"
                />
              </div>
              {memberSearch && !selectedMemberId && (
                <div className="absolute z-10 mt-1 w-[200px] max-h-[120px] overflow-y-auto border rounded-md bg-background shadow-md">
                  {filteredMembers.slice(0, 5).map((m: Pick<Member, "id" | "first_name" | "last_name" | "phone" | "member_number">) => (
                    <div
                      key={m.id}
                      className="p-1.5 text-xs cursor-pointer hover:bg-accent truncate"
                      onClick={() => { setSelectedMemberId(m.id); setMemberSearch(`${toUpper(m.first_name)} ${toUpper(m.last_name)}`); setPage(0) }}
                    >
                      {toUpper(m.first_name)} {toUpper(m.last_name)}
                      {m.member_number && <span className="text-muted-foreground ml-1 text-[10px]">({m.member_number})</span>}
                    </div>
                  ))}
                </div>
              )}
              {selectedMemberId && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSelectedMemberId(null); setMemberSearch(""); setPage(0) }}>
                  {t("common.clear") || "Effacer"}
                </Button>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.method") || "Moyen"}</label>
              <Select value={methodFilter} onValueChange={v => { setMethodFilter(v); setPage(0) }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("encaissement.allMethods") || "Tous"}</SelectItem>
                  <SelectItem value="cash">{t("encaissement.cash") || "Espèces"}</SelectItem>
                  <SelectItem value="card">{t("encaissement.card") || "Carte"}</SelectItem>
                  <SelectItem value="transfer">{t("encaissement.transfer") || "Virement"}</SelectItem>
                  <SelectItem value="other">{t("encaissement.other") || "Autre"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.type") || "Type"}</label>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0) }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("encaissement.allTypes") || "Tous"}</SelectItem>
                  <SelectItem value="subscription">{t("encaissement.subscription") || "Abonnement"}</SelectItem>
                  <SelectItem value="renewal">{t("encaissement.renewal") || "Renouvellement"}</SelectItem>
                  <SelectItem value="dropin">{t("encaissement.dropin") || "Séance libre"}</SelectItem>
                  <SelectItem value="product">{t("encaissement.product") || "Produit"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="default" size="sm" className="h-9" onClick={() => { setDateFrom(monthStartStr); setDateTo(today); setMethodFilter("all"); setTypeFilter("all"); setMemberSearch(""); setSelectedMemberId(null); setPage(0) }}>
              {t("common.reset") || "Réinitialiser"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">{t("encaissement.noData") || "Aucun encaissement trouvé"}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left p-3 font-medium">{t("encaissement.date") || "Date"}</th>
                      <th className="text-left p-3 font-medium">{t("encaissement.type") || "Type"}</th>
                      <th className="text-left p-3 font-medium">{t("pos.member") || "Membre"}</th>
                      <th className="text-left p-3 font-medium">{t("encaissement.detail") || "Détail"}</th>
                      <th className="text-right p-3 font-medium">{t("payments.amount") || "Montant"}</th>
                      <th className="text-center p-3 font-medium">{t("encaissement.method") || "Moyen"}</th>
                      <th className="text-center p-3 font-medium">{t("encaissement.status") || "Statut"}</th>
                      {canManage && <th className="text-center p-3 font-medium">{t("encaissement.actions") || "Actions"}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map(row => (
                      <tr key={`${row.type}-${row.id}`} className="border-b last:border-0 hover:bg-accent/30">
                        <td className="p-3 whitespace-nowrap">
                          {new Date(row.date).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {row.detailType === "subscription" && <CreditCard className="h-3.5 w-3.5 text-primary" />}
                            {row.detailType === "renewal" && <RefreshCw className="h-3.5 w-3.5 text-warning" />}
                            {row.detailType === "dropin" && <Ticket className="h-3.5 w-3.5 text-success" />}
                            {row.detailType === "product" && <Package className="h-3.5 w-3.5 text-muted-foreground" />}
                            <Badge variant={row.detailType === "subscription" || row.detailType === "renewal" ? "default" : "secondary"}>
                              {row.detailType === "subscription" ? (t("encaissement.subscription") || "Abonnement") : row.detailType === "renewal" ? (t("encaissement.renewal") || "Renouvellement") : row.detailType === "dropin" ? (t("encaissement.dropin") || "Séance libre") : (t("encaissement.product") || "Produit")}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {row.memberId ? (
                            <button
                              type="button"
                              onClick={() => openMember(row.memberId)}
                              title="Ouvrir la fiche adhérent"
                              className="text-left cursor-pointer hover:text-primary hover:underline transition-colors"
                            >
                              {row.memberName}
                            </button>
                          ) : row.memberName}
                        </td>
                        <td className="p-3 whitespace-nowrap text-xs text-muted-foreground max-w-[200px] truncate" title={row.description}>
                          {row.description}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap font-medium tabular-nums">{formatCurrency(row.amount)}</td>
                        <td className="p-3 text-center whitespace-nowrap">{methodBadge(row.method)}</td>
                        <td className="p-3 text-center whitespace-nowrap">{statusBadge(row.status)}</td>
                        {canManage && (
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title={t("encaissement.history") || "Historique"} onClick={() => setHistoryRow(row)}>
                                <History className="h-3.5 w-3.5" />
                              </Button>
                              {row.status !== "cancelled" && (
                                <>
                                  {row.type === "subscription" && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title={t("encaissement.edit") || "Modifier"} onClick={() => openModify(row)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title={t("encaissement.cancel") || "Annuler"} onClick={() => { setCancelRow(row); setCancelReason("") }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Separator />
              <div className="flex items-center justify-between p-3 text-sm">
                <span className="text-muted-foreground">{t("encaissement.itemsCount")?.replace("{count}", String(filtered.length)) || `${filtered.length} encaissement(s)`}</span>
                <span className="font-semibold">{t("pos.total") || "Total"} : {formatCurrency(totals.total)}</span>
              </div>
              <div className="px-3 pb-3">
                <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={20} onPageChange={setPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modify dialog */}
      <Dialog open={!!modifyRow} onOpenChange={(open) => { if (!open) setModifyRow(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("encaissement.modifyTitle") || "Modifier l'encaissement"}</DialogTitle>
            <DialogDescription>
              {modifyRow?.memberName} — {modifyRow?.type === "subscription" ? (t("encaissement.modifySubLabel") || "Abonnement") : (t("encaissement.posSaleLabel") || "Vente POS")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.amountLabel") || "Montant"}</label>
              <Input type="number" min="0" step="0.01" value={modifyAmount} onChange={e => setModifyAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.dateLabel") || "Date"}</label>
              <Input type="date" value={modifyDate} onChange={e => setModifyDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.methodLabel") || "Moyen"}</label>
              <Select value={modifyMethod} onValueChange={setModifyMethod}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("encaissement.cash") || "Espèces"}</SelectItem>
                  <SelectItem value="card">{t("encaissement.card") || "Carte"}</SelectItem>
                  <SelectItem value="transfer">{t("encaissement.transfer") || "Virement"}</SelectItem>
                  <SelectItem value="other">{t("encaissement.other") || "Autre"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("encaissement.reason") || "Motif"}</label>
              <Textarea value={modifyReason} onChange={e => setModifyReason(e.target.value)} placeholder={t("encaissement.reasonPlaceholder") || "Motif de la modification (obligatoire)"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifyRow(null)}>{t("common.cancel") || "Annuler"}</Button>
            <Button
              disabled={!modifyReason.trim() || modifyAmount === "" || Number(modifyAmount) < 0 || modifyMutation.isPending}
              onClick={() => modifyMutation.mutate()}
            >
              {modifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("encaissement.save") || "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={!!cancelRow} onOpenChange={(open) => { if (!open) setCancelRow(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("encaissement.cancelTitle") || "Annuler l'encaissement"}</DialogTitle>
            <DialogDescription>
              {t("encaissement.cancelConfirm") || "Confirmez l'annulation de cet encaissement. Cette action est définitive et enregistrée dans l'historique."}
            </DialogDescription>
          </DialogHeader>
          {cancelRow && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("pos.member") || "Membre"}</span>
                <span className="font-medium">{cancelRow.memberName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("payments.amount") || "Montant"}</span>
                <span className="font-medium">{formatCurrency(cancelRow.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("encaissement.type") || "Type"}</span>
                <span className="font-medium">{cancelRow.type === "subscription" ? (t("encaissement.subscription") || "Abonnement") : (t("encaissement.pos") || "Vente POS")}</span>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("encaissement.reason") || "Motif"}</label>
            <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder={t("encaissement.reasonPlaceholder") || "Motif de l'annulation (obligatoire)"} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelRow(null)}>{t("common.close") || "Fermer"}</Button>
            <Button variant="destructive" disabled={!cancelReason.trim() || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("encaissement.cancel") || "Annuler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyRow} onOpenChange={(open) => { if (!open) setHistoryRow(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("encaissement.historyOf") || "Historique des changements"}</DialogTitle>
            <DialogDescription>
              {historyRow?.memberName} — {historyRow?.type === "subscription" ? (t("encaissement.subscription") || "Abonnement") : (t("encaissement.pos") || "Vente POS")}
            </DialogDescription>
          </DialogHeader>
          {historyData && historyData.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">{t("encaissement.noHistory") || "Aucun historique"}</div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto space-y-3">
              {(historyData ?? []).map((c: PaymentChange) => (
                <div key={c.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={c.action === "cancel" ? "destructive" : "default"}>
                      {c.action === "cancel" ? (t("encaissement.cancel") || "Annulation") : (t("encaissement.change") || "Modification")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  {renderOldNew(c)}
                  {c.reason && (
                    <p className="text-xs mt-2 text-muted-foreground">
                      <span className="font-medium">{t("encaissement.reason") || "Motif"} :</span> {c.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
