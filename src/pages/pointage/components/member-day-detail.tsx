import { useQuery } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Loader2, Clock, CalendarDays, Shield, UserRound, ReceiptText, Wallet, ShoppingCart } from "lucide-react"
import { formatDate, formatCurrency, toUpper, displayPhone } from "@/lib/utils"
import { computeDurationMin, formatDurationMin, getMemberStatus } from "../lib/dayActivity"

interface MemberDayDetailProps {
  memberId: string | null
  memberName: string
  date: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DayDetailData {
  attendance: { id: string; check_in: string | null; check_out: string | null; source: string | null }[]
  member: { id: string; first_name: string; last_name: string; member_number: string | null; phone: string | null; coach_id: string | null; status: string | null } | null
  subscription: { status: string; start_date: string; end_date: string; total_amount: number; subscription_types: { name: string | null } | null } | null
  pos: { id: string; total: number; payment_method: string | null; items: unknown; created_at: string }[]
  payments: { id: string; amount: number; payment_method: string | null; payment_date: string }[]
  rfid: { rfid_uid: string; status: string } | null
  coach: { id: string; first_name: string; last_name: string } | null
}

const EMPTY: DayDetailData = { attendance: [], member: null, subscription: null, pos: [], payments: [], rfid: null, coach: null }

function formatTime(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

const statusVariant: Record<string, { label: string; className: string }> = {
  completed: { label: "Terminé", className: "bg-success/10 text-success border-success/30" },
  in_progress: { label: "En cours", className: "bg-warning/10 text-warning border-warning/30" },
  open: { label: "Session ouverte", className: "bg-muted text-muted-foreground border-muted" },
}

const subVariant: Record<string, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-success/10 text-success border-success/30" },
  pending_payment: { label: "En attente", className: "bg-warning/10 text-warning border-warning/30" },
  expired: { label: "Expiré", className: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelled: { label: "Annulé", className: "bg-muted text-muted-foreground border-muted" },
}

export function MemberDayDetail({ memberId, memberName, date, open, onOpenChange }: MemberDayDetailProps) {
  const t = useT()
  const supabase = useSupabase()
  const { organization } = useAuth()
  const orgId = organization?.id

  const { data, isLoading } = useQuery({
    queryKey: ["member-day-detail", memberId ?? "", date, orgId],
    queryFn: async (): Promise<DayDetailData> => {
      if (!orgId || !memberId) return EMPTY
      const from = `${date}T00:00:00`
      const to = `${date}T23:59:59.999`
      const [attendance, member, subscription, pos, payments, rfid] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, check_in, check_out, source")
          .eq("organization_id", orgId)
          .eq("member_id", memberId)
          .gte("check_in", from)
          .lte("check_in", to)
          .order("check_in", { ascending: true }),
        supabase
          .from("members")
          .select("id, first_name, last_name, member_number, phone, coach_id, status")
          .eq("id", memberId)
          .maybeSingle(),
        supabase
          .from("member_subscriptions")
          .select("status, start_date, end_date, total_amount, subscription_types(name)")
          .eq("member_id", memberId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("pos_transactions")
          .select("id, total, payment_method, items, created_at")
          .eq("organization_id", orgId)
          .eq("member_id", memberId)
          .is("cancelled_at", null)
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("id, amount, payment_method, payment_date")
          .eq("organization_id", orgId)
          .eq("member_id", memberId)
          .eq("status", "completed")
          .gte("payment_date", from)
          .lte("payment_date", to)
          .order("payment_date", { ascending: false }),
        supabase
          .from("rfid_cards")
          .select("rfid_uid, status")
          .eq("member_id", memberId)
          .eq("status", "ACTIF")
          .maybeSingle(),
      ])

      let coach: { id: string; first_name: string; last_name: string } | null = null
      const m = (member.data ?? null) as DayDetailData["member"]
      if (m?.coach_id) {
        try {
          const { data: roster } = await (supabase.rpc as any)("get_staff_roster", { p_org_id: orgId })
          coach = (roster ?? []).find((s: { id: string }) => s.id === m.coach_id) ?? null
        } catch {
          coach = null
        }
      }

      const items = (pos.data ?? []) as any[]
      return {
        attendance: (attendance.data ?? []) as DayDetailData["attendance"],
        member: m,
        subscription: (subscription.data ?? null) as DayDetailData["subscription"],
        pos: items.map((p: any) => ({ id: p.id, total: Number(p.total || 0), payment_method: p.payment_method ?? null, items: p.items, created_at: p.created_at })),
        payments: ((payments.data ?? []) as any[]).map((p: any) => ({ id: p.id, amount: Number(p.amount || 0), payment_method: p.payment_method ?? null, payment_date: p.payment_date })),
        rfid: (rfid.data ?? null) as DayDetailData["rfid"],
        coach,
      }
    },
    enabled: !!orgId && !!memberId && open,
  })

  const sub = data?.subscription
  const subDaysLeft = sub?.end_date ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000)) : null
  const subBadge = sub ? (subVariant[sub.status] ?? { label: sub.status, className: "bg-muted text-muted-foreground border-muted" }) : null
  const totalPos = (data?.pos ?? []).reduce((a: number, p: { total: number }) => a + p.total, 0)
  const totalPayments = (data?.payments ?? []).reduce((a: number, p: { amount: number }) => a + p.amount, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {toUpper(memberName)}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(date)} · N° {data?.member?.member_number ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0 space-y-4">

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-success/5 border border-success/20 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Encaissements</p>
                <p className="text-lg font-bold">{formatCurrency(totalPayments)}</p>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><ShoppingCart className="h-3 w-3" /> Achats POS</p>
                <p className="text-lg font-bold">{formatCurrency(totalPos)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Présence</h4>
              {(data?.attendance ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun pointage ce jour</p>
              ) : (
                data?.attendance.map((a: { id: string; check_in: string | null; check_out: string | null; source: string | null }) => {
                  const status = getMemberStatus(a.check_in, a.check_out)
                  const badge = statusVariant[status]
                  const source = a.source === "rfid" ? "RFID" : a.source === "manual" ? "Manuel" : "App"
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {formatTime(a.check_in)} → {formatTime(a.check_out)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDurationMin(computeDurationMin(a.check_in, a.check_out)) || "—"} · {source}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                    </div>
                  )
                })
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="p-3">
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2"><ReceiptText className="h-4 w-4 text-primary" /> Abonnement</h4>
                {!sub ? (
                  <p className="text-sm text-muted-foreground">Aucun abonnement</p>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{sub.subscription_types?.name ?? "—"}</span>
                      {subBadge && <Badge variant="outline" className={subBadge.className}>{subBadge.label}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(sub.start_date)} → {formatDate(sub.end_date)}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(sub.total_amount)}</p>
                    {subDaysLeft != null && (
                      <p className={`text-xs ${sub.status === "active" && subDaysLeft <= 7 ? "text-orange-500 font-medium" : "text-muted-foreground"}`}>
                        {subDaysLeft === 0 ? "Expire aujourd'hui" : `Expire dans ${subDaysLeft} j`}
                      </p>
                    )}
                  </div>
                )}
              </Card>

              <Card className="p-3">
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2"><Shield className="h-4 w-4 text-primary" /> Carte & Coach</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Badge RFID</span>
                    <span className="font-mono text-xs">{data?.rfid?.rfid_uid ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Coach</span>
                    <span className="text-xs font-medium">{data?.coach ? `${data.coach.first_name} ${data.coach.last_name}` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Téléphone</span>
                    <span className="text-xs font-medium">{data?.member?.phone ? displayPhone(data.member.phone) : "—"}</span>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /> Achats de la journée</h4>
              {(data?.pos ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun achat ce jour</p>
              ) : (
                data?.pos.map((p: { id: string; total: number; payment_method: string | null; items: unknown; created_at: string }) => {
                  const items = Array.isArray(p.items) ? (p.items as { name?: string; quantity?: number }[]) : []
                  return (
                    <div key={p.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{formatDate(p.created_at)} · {p.payment_method ?? "—"}</span>
                        <span className="font-semibold">{formatCurrency(p.total)}</span>
                      </div>
                      {items.length > 0 && (
                        <p className="text-xs text-muted-foreground">{items.map((i: { name?: string; quantity?: number }) => `${i.name ?? "Article"}${i.quantity && i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}</p>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /> Paiements de la journée</h4>
              {(data?.payments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun paiement ce jour</p>
              ) : (
                data?.payments.map((p: { id: string; amount: number; payment_method: string | null; payment_date: string }) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span className="text-xs text-muted-foreground">{formatDate(p.payment_date)} · {p.payment_method ?? "—"}</span>
                    <span className="font-semibold">{formatCurrency(p.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
