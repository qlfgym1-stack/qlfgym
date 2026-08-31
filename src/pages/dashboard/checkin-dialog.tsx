import { useState, useEffect, useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@/hooks/useQuery"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { getInitials } from "@/lib/utils"
import {
  CheckCircle2, XCircle, Clock, Loader2, CreditCard, ShieldAlert, UserCheck,
} from "lucide-react"
import type { Member } from "@/types/supabase"

const DIALOG_TERMINAL = "dashboard"

type ScanResult = {
  result: "granted" | "denied" | "pending"
  reason?: string
  member_id?: string
  attendance_id?: string
}

interface CheckinDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CheckinDialog({ open, onOpenChange }: CheckinDialogProps) {
  const t = useT()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization, user, roles } = useAuth()
  const { toast } = useToast()
  const orgId = organization?.id
  const userId = user?.id
  const inputRef = useRef<HTMLInputElement>(null)

  const [cardUid, setCardUid] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [manualReason, setManualReason] = useState("")
  const [manualDetail, setManualDetail] = useState("")

  const canManualValidate = roles?.some(r => r.role === "admin" || r.role === "staff")

  const { data: members } = useQuery({
    queryKey: ["members-search", orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data } = await supabase
        .from("members")
        .select("id, first_name, last_name, photo_url")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("first_name")
      return data as Pick<Member, "id" | "first_name" | "last_name" | "photo_url">[]
    },
    enabled: !!orgId && open,
  })

  const rfidCheckInMutation = useMutation({
    mutationFn: async (uid: string) => {
      const { data } = await (supabase.rpc as any)("rfid_check_in", {
        p_card_uid: uid,
        p_terminal: DIALOG_TERMINAL,
      })
      return data as ScanResult
    },
    onSuccess: (data: ScanResult) => {
      queryClient.invalidateQueries({ queryKey: ["recent-activity"] })
      queryClient.invalidateQueries({ queryKey: ["turnstile-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      if (data.result === "granted") {
        toast({ title: t("kiosk.granted") || "Accès autorisé" })
      } else if (data.result === "denied") {
        toast({ title: t("kiosk.denied") || "Accès refusé", description: data.reason, variant: "destructive" })
      } else {
        toast({ title: t("kiosk.pending") || "En attente", description: data.reason })
      }
    },
    onError: (err: Error) => {
      toast({ title: t("common.error") || "Error", description: err.message, variant: "destructive" })
    },
  })

  const rfidCheckOutMutation = useMutation({
    mutationFn: async (uid: string) => {
      const { data } = await (supabase.rpc as any)("rfid_check_out", {
        p_card_uid: uid,
        p_terminal: DIALOG_TERMINAL,
      })
      return data as ScanResult
    },
    onSuccess: (data: ScanResult) => {
      queryClient.invalidateQueries({ queryKey: ["recent-activity"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      if (data.result === "granted") {
        toast({ title: "Check-out effectué" })
      } else {
        toast({ title: t("kiosk.denied") || "Accès refusé", description: data.reason, variant: "destructive" })
      }
    },
    onError: (err: Error) => {
      toast({ title: t("common.error") || "Error", description: err.message, variant: "destructive" })
    },
  })

  const manualCheckInMutation = useMutation({
    mutationFn: async (params: { p_member_id: string; p_user_id: string; p_reason: string; p_terminal?: string; p_reason_detail?: string }) => {
      const { data } = await (supabase.rpc as any)("manual_check_in", params)
      return data as ScanResult
    },
    onSuccess: (data: ScanResult) => {
      queryClient.invalidateQueries({ queryKey: ["recent-activity"] })
      queryClient.invalidateQueries({ queryKey: ["turnstile-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      setSelectedMemberId(null)
      setManualReason("")
      setManualDetail("")
      if (data.result === "granted") {
        toast({ title: "Validation manuelle effectuée" })
      } else {
        toast({ title: t("kiosk.denied") || "Accès refusé", description: data.reason, variant: "destructive" })
      }
    },
    onError: (err: Error) => {
      toast({ title: t("common.error") || "Error", description: err.message, variant: "destructive" })
    },
  })

  const handleScan = useCallback(async () => {
    const uid = cardUid.trim()
    if (!uid) return
    setIsScanning(true)
    setScanResult(null)
    await rfidCheckInMutation.mutateAsync(uid)
    setScanResult(rfidCheckInMutation.data ?? null)
    setCardUid("")
    setIsScanning(false)
    inputRef.current?.focus()
  }, [cardUid, rfidCheckInMutation])

  const handleCheckOut = useCallback(async () => {
    const uid = cardUid.trim()
    if (!uid) return
    setIsScanning(true)
    await rfidCheckOutMutation.mutateAsync(uid)
    setScanResult(rfidCheckOutMutation.data ?? null)
    setCardUid("")
    setIsScanning(false)
    inputRef.current?.focus()
  }, [cardUid, rfidCheckOutMutation])

  const handleManualValidate = useCallback(() => {
    if (!selectedMemberId || !manualReason || !userId) return
    manualCheckInMutation.mutate({
      p_member_id: selectedMemberId,
      p_user_id: userId,
      p_reason: manualReason,
      p_terminal: DIALOG_TERMINAL,
      p_reason_detail: manualDetail || undefined,
    })
  }, [selectedMemberId, manualReason, userId, manualDetail, manualCheckInMutation])

  useEffect(() => {
    if (scanResult && scanResult.result === "granted") {
      const timer = setTimeout(() => setScanResult(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [scanResult])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setCardUid("")
      setScanResult(null)
      setMemberSearch("")
      setSelectedMemberId(null)
      setManualReason("")
      setManualDetail("")
    }
  }, [open])

  const filteredMembers = (members ?? []).filter((m: Pick<Member, "id" | "first_name" | "last_name" | "photo_url">) =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(memberSearch.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("kiosk.title") || "Check-in / Check-out"}</DialogTitle>
          <DialogDescription>{t("kiosk.subtitle") || "Scanner le badge RFID ou valider manuellement"}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                ref={inputRef}
                placeholder={t("kiosk.rfidPlaceholder") || "Numéro du badge RFID..."}
                value={cardUid}
                onChange={(e) => setCardUid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScan()
                }}
                className="h-12 text-lg"
                autoFocus
              />
            </div>
            <Button
              size="lg"
              onClick={handleScan}
              disabled={!cardUid.trim() || isScanning}
              className="h-12 px-5"
            >
              {isScanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCheck className="h-5 w-5" />}
              {t("kiosk.checkIn") || "Entrée"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleCheckOut}
              disabled={!cardUid.trim() || isScanning}
              className="h-12 px-5"
            >
              <CreditCard className="h-5 w-5" />
              {t("kiosk.checkOut") || "Sortie"}
            </Button>
          </div>

          {scanResult && (
            <div className={`rounded-lg border flex items-center gap-3 p-4 ${
              scanResult.result === "granted" ? "bg-success/10 border-success" :
              scanResult.result === "denied" ? "bg-destructive/10 border-destructive" :
              "bg-warning/10 border-warning"
            }`}>
              {scanResult.result === "granted" ? <CheckCircle2 className="h-8 w-8 text-success shrink-0" /> :
               scanResult.result === "denied" ? <XCircle className="h-8 w-8 text-destructive shrink-0" /> :
               <Clock className="h-8 w-8 text-warning shrink-0" />}
              <div>
                <p className="font-semibold">
                  {scanResult.result === "granted" ? (t("kiosk.granted") || "Accès autorisé") :
                   scanResult.result === "denied" ? (t("kiosk.denied") || "Accès refusé") :
                   (t("kiosk.pending") || "En attente")}
                </p>
                {scanResult.reason && <p className="text-sm text-muted-foreground">{scanResult.reason}</p>}
              </div>
            </div>
          )}

          {canManualValidate && (
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                {t("kiosk.manualValidation") || "Validation manuelle"}
              </h4>
              <Input
                placeholder={t("kiosk.searchMember") || "Rechercher un adhérent..."}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
              <ScrollArea className="h-[180px]">
                <div className="space-y-1">
                  {filteredMembers.map((m: Pick<Member, "id" | "first_name" | "last_name" | "photo_url">) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMemberId(m.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-md border bg-card hover:bg-accent transition-colors text-left ${
                        selectedMemberId === m.id ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      <Avatar className="h-8 w-8">
                        {m.photo_url ? <AvatarImage src={m.photo_url} /> : null}
                        <AvatarFallback>{getInitials(m.first_name, m.last_name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{m.first_name} {m.last_name}</span>
                    </button>
                  ))}
                  {filteredMembers.length === 0 && memberSearch && (
                    <p className="text-center text-muted-foreground py-4 text-sm">{t("common.noResults") || "Aucun résultat"}</p>
                  )}
                </div>
              </ScrollArea>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("kiosk.selectReason") || "Motif"}</Label>
                  <Select value={manualReason} onValueChange={setManualReason}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("kiosk.selectReason") || "Motif"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakdown">{t("kiosk.manualBreakdown") || "Panne"}</SelectItem>
                      <SelectItem value="maintenance">{t("kiosk.manualMaintenance") || "Maintenance"}</SelectItem>
                      <SelectItem value="emergency">{t("kiosk.manualEmergency") || "Urgence"}</SelectItem>
                      <SelectItem value="test">{t("kiosk.manualTest") || "Test"}</SelectItem>
                      <SelectItem value="other">{t("kiosk.manualOther") || "Autre"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("kiosk.manualDetail") || "Détail"}</Label>
                  <Input
                    value={manualDetail}
                    onChange={(e) => setManualDetail(e.target.value)}
                    placeholder={t("kiosk.manualDetail") || "Détail (optionnel)"}
                  />
                </div>
              </div>
              <Button
                className="w-full gap-2"
                disabled={!selectedMemberId || !manualReason || manualCheckInMutation.isPending}
                onClick={handleManualValidate}
              >
                {manualCheckInMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                {t("kiosk.manualValidation") || "VALIDATION MANUELLE"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
