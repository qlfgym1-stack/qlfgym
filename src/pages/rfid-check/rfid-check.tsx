import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { PageHeader } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { RfidCard, RfidCardAudit, Member } from "@/types/supabase"
import { formatDateTime } from "@/lib/utils"
import { Search, CheckCircle2, Warehouse, ShieldOff, ArrowLeftRight, Loader2 } from "lucide-react"
import { azertyToDigits } from "@/lib/azerty"

type SupportLookup = {
  card: RfidCard | null
  member_name: string
  audit: RfidCardAudit[]
}

const RELEASE_REASONS = ["Retour du badge", "Membre quitté", "Badge de rechange", "Test / Démos", "Autre"]

export default function RfidCheckPage() {
  const t = useT()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id

  const [queryUid, setQueryUid] = useState("")
  const [uid, setUid] = useState<string | null>(null)
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [releaseReason, setReleaseReason] = useState("Retour du badge")
  const [releaseNotes, setReleaseNotes] = useState("")
  const [assignMemberId, setAssignMemberId] = useState<string>("")
  const [assignNotes, setAssignNotes] = useState("")

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["support-lookup", uid],
    queryFn: async () => {
      if (!uid) return { card: null, member_name: "", audit: [] } as SupportLookup
      const { data: card, error: cardErr } = await supabase
        .from("rfid_cards")
        .select("*, member:members(first_name, last_name)")
        .eq("rfid_uid", uid)
        .maybeSingle()
      if (cardErr) throw cardErr
      if (!card) return { card: null, member_name: "", audit: [] } as SupportLookup

      let audit: RfidCardAudit[] = []
      const { data: logs } = await supabase
        .from("rfid_audit_log")
        .select("*")
        .or(`old_rfid_uid.eq.${uid},new_rfid_uid.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(10)
      audit = (logs ?? []) as RfidCardAudit[]

      const m = (card as any).member as Pick<Member, "first_name" | "last_name"> | null
      return {
        card: card as RfidCard,
        member_name: m ? `${m.first_name} ${m.last_name}` : "",
        audit,
      }
    },
    enabled: !!uid && !!orgId,
  })

  type AssignableMember = Pick<Member, "id" | "first_name" | "last_name" | "status">

const { data: assignableMembers } = useQuery({
    queryKey: ["assignable-members", orgId],
    queryFn: async (): Promise<AssignableMember[]> => {
      if (!orgId) return []
      const { data } = await supabase
        .from("members")
        .select("id, first_name, last_name, status")
        .eq("organization_id", orgId)
        .order("first_name")
      if (!data) return []
      // membres sans carte ACTIF déjà en base
      const withCards = await supabase
        .from("rfid_cards")
        .select("member_id")
        .eq("status", "ACTIF")
        .then(r => new Set((r.data ?? []).map((x: any) => x.member_id)))
      return (data as AssignableMember[]).filter(m => !withCards.has(m.id))
    },
    enabled: assignDialogOpen && !!orgId,
  })

  const card = data?.card
  const released = !!card?.released_at
  const status = card?.status

  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!card) throw new Error("Aucun support")
      const { data, error } = await (supabase.rpc as any)("release_support", {
        p_card_id: card.id,
        p_reason: releaseReason === "Autre" ? (releaseNotes || "Autre") : releaseReason,
        p_notes: releaseNotes || null,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast({ title: t("rfidCheck.released") })
      setReleaseDialogOpen(false)
      setReleaseNotes("")
      refetch()
      queryClient.invalidateQueries({ queryKey: ["members"] })
    },
    onError: (e: Error) => toast({ title: t("errors.generic"), description: e.message, variant: "destructive" }),
  })

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!card || !assignMemberId) throw new Error("Membre requis")
      const { data, error } = await (supabase.rpc as any)("assign_released_card", {
        p_card_id: card.id,
        p_member_id: assignMemberId,
        p_reason: "Réattribution d'un support libéré",
        p_notes: assignNotes || null,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast({ title: t("rfidCheck.assigned") })
      setAssignDialogOpen(false)
      setAssignMemberId("")
      setAssignNotes("")
      refetch()
      queryClient.invalidateQueries({ queryKey: ["members"] })
    },
    onError: (e: Error) => toast({ title: t("errors.generic"), description: e.message, variant: "destructive" }),
  })

  const doSearch = () => {
    const trimmed = azertyToDigits(queryUid).trim()
    if (!trimmed) return
    setUid(trimmed)
  }

  const statusLabel = (status: string | undefined, isReleased: boolean) => {
    if (!status) return null
    if (isReleased) {
      return <Badge variant="outline" className="bg-secondary/10 text-secondary border-secondary/40">{t("rfidCheck.ready")}</Badge>
    }
    const map: Record<string, string> = {
      ACTIF: t("rfidCheck.statusActive"),
      REMPLACÉ: t("rfidCheck.statusReplaced"),
      DÉSACTIVÉ: t("rfidCheck.statusDeactivated"),
      PERDU: t("rfidCheck.statusLost"),
      VOLÉ: t("rfidCheck.statusStolen"),
      BLACKLISTÉ: t("rfidCheck.statusBlacklisted"),
      ARCHIVÉ: t("rfidCheck.statusArchived"),
    }
    const base = map[status] ?? status
    if (status === "ACTIF") return <Badge className="bg-success text-success-foreground">{base}</Badge>
    if (status === "REMPLACÉ") return <Badge variant="secondary">{base}</Badge>
    if (status === "DÉSACTIVÉ") { const r = card?.released_at ? t("rfidCheck.ready") : base; return r === t("rfidCheck.ready") ? <Badge variant="outline" className="bg-secondary/10 text-secondary border-secondary/40">{r}</Badge> : <Badge variant="destructive">{r}</Badge> }
    return <Badge variant="destructive">{base}</Badge>
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-3xl">
      <PageHeader title={t("rfidCheck.title")} description={t("rfidCheck.description")} />

      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> {t("rfidCheck.scanTitle")}</CardTitle>
          <CardDescription>{t("rfidCheck.scanHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={queryUid}
              onChange={e => setQueryUid(azertyToDigits(e.target.value))}
              onKeyDown={e => { if (e.key === "Enter") doSearch() }}
              placeholder={t("rfidCheck.scanPlaceholder")}
              className="font-mono"
            />
            <Button onClick={doSearch} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {t("rfidCheck.search")}
            </Button>
          </div>

          {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

          {!isLoading && uid && !card && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Search className="h-8 w-8 opacity-40" />
              <p>{t("rfidCheck.notFound")}</p>
            </div>
          )}

          {!isLoading && card && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-mono text-sm text-muted-foreground">{card.rfid_uid}</div>
                  <div className="text-lg font-semibold">{data?.member_name || "-"}</div>
                  <div className="text-sm text-muted-foreground">
                    {t("rfidCheck.assignedAt")} :{" "}
                    {card.assigned_at ? formatDateTime(card.assigned_at) : "-"}
                  </div>
                  {released && (
                    <div className="text-sm text-emerald-600">
                      {t("rfidCheck.releasedAt")} : {card.released_at ? formatDateTime(card.released_at) : "-"}
                    </div>
                  )}
                  {card.notes && <div className="text-sm text-muted-foreground">{t("rfidCheck.notes")} : {card.notes}</div>}
                </div>
                <div className="text-right">{statusLabel(status, released)}</div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {status === "ACTIF" && (
                  <Button variant="destructive" onClick={() => setReleaseDialogOpen(true)}>
                    <ShieldOff className="h-4 w-4" /> {t("rfidCheck.release")}
                  </Button>
                )}
                {released && (
                  <Button onClick={() => { setAssignDialogOpen(true); setAssignMemberId("") }}>
                    <ArrowLeftRight className="h-4 w-4" /> {t("rfidCheck.assign")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {card && data && data.audit.length > 0 && (
        <Card className="card-shadow">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Warehouse className="h-4 w-4" /> {t("rfidCheck.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.audit.map((a: RfidCardAudit) => (
                <div key={a.id} className="flex items-center justify-between text-sm rounded bg-muted/50 px-3 py-2">
                  <span className="font-medium">{a.action}</span>
                  <span className="text-muted-foreground">{a.reason || a.notes || "-"}</span>
                  <span className="text-muted-foreground text-xs">{a.created_at ? formatDateTime(a.created_at) : "-"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation libération */}
      <Dialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t("rfidCheck.releaseTitle")}</DialogTitle>
            <DialogDescription>
              {t("rfidCheck.releaseConfirm")}
              <div className="mt-3 space-y-1 text-sm text-foreground">
                <div><strong>{t("rfidCheck.member")}</strong> : {data?.member_name || "-"}</div>
                <div><strong>{t("rfidCheck.type")}</strong> : RFID</div>
                <div><strong>{t("rfidCheck.code")}</strong> : <span className="font-mono">{card?.rfid_uid}</span></div>
                <div><strong>{t("rfidCheck.assignedAt")}</strong> : {card?.assigned_at ? formatDateTime(card.assigned_at) : "-"}</div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("rfidCheck.reason")}</label>
              <Select value={releaseReason} onValueChange={setReleaseReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELEASE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {releaseReason === "Autre" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("rfidCheck.notes")}</label>
                <Input value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} placeholder={t("rfidCheck.notesPlaceholder")} />
              </div>
            )}
            <div className="rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("rfidCheck.releaseExplainer")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseDialogOpen(false)}>{t("rfidCheck.cancel")}</Button>
            <Button variant="destructive" onClick={() => releaseMutation.mutate()} disabled={releaseMutation.isPending || (releaseReason === "Autre" && !releaseNotes.trim())}>
              {releaseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("rfidCheck.confirmRelease")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attribution à un membre */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rfidCheck.assignTitle")}</DialogTitle>
            <DialogDescription>{t("rfidCheck.assignDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("rfidCheck.member")}</label>
              <Select value={assignMemberId} onValueChange={setAssignMemberId}>
                <SelectTrigger><SelectValue placeholder={t("rfidCheck.selectMember")} /></SelectTrigger>
                <SelectContent>
                  {(assignableMembers ?? []).map((m: AssignableMember) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} {m.status !== "active" ? `(${m.status})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(assignableMembers ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">{t("rfidCheck.noAssignable")}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("rfidCheck.notes")}</label>
              <Input value={assignNotes} onChange={e => setAssignNotes(e.target.value)} placeholder={t("rfidCheck.notesPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>{t("rfidCheck.cancel")}</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={!assignMemberId || assignMutation.isPending}>
              {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("rfidCheck.confirmAssign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}