import { useState, useCallback } from "react"
import { useT } from "@/i18n"
import { useAuth } from "@/stores/auth"
import { useSupabase } from "@/hooks/useSupabase"
import { useQuery, useMutation, useQueryClient } from "@/hooks/useQuery"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Clock, CheckCircle2, Send, X } from "lucide-react"
import type { WhatsappOutbox } from "@/types/supabase"

interface RemindersTabProps {
  orgId?: string
}

export function RemindersTab({ orgId }: RemindersTabProps) {
  const t = useT()
  const { roles } = useAuth()
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [approveLoading, setApproveLoading] = useState(false)

  const isAdmin = roles?.some((r) => r.role === "admin")

  // Fetch pending_manual entries
  const { data: pendingEntries, isLoading: pendingLoading } = useQuery({
    queryKey: ["whatsapp-reminders-pending", orgId],
    queryFn: async () => {
      if (!orgId) return [] as WhatsappOutbox[]
      const { data, error } = await supabase
        .from("whatsapp_outbox")
        .select("*")
        .eq("status", "pending_manual")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as WhatsappOutbox[]
    },
    refetchInterval: 30000,
    enabled: !!orgId,
  })

  // Fetch sent_via_link count
  const { data: sentData } = useQuery({
    queryKey: ["whatsapp-reminders-sent", orgId],
    queryFn: async () => {
      if (!orgId) return { count: 0 } as { count: number }
      const { count, error } = await supabase
        .from("whatsapp_outbox")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent_via_link")
        .eq("organization_id", orgId)
      if (error) throw error
      return { count: count ?? 0 } as { count: number }
    },
    enabled: !!orgId,
  })

  // Approve and send mutation
  const approveMutation = useMutation({
    mutationFn: async (outboxId: string) => {
      const { data, error } = await (supabase.rpc as any)("approve_and_send_whatsapp", { p_outbox_id: outboxId })
      if (error) throw error
      return data as any
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-reminders-pending"] })
      queryClient.invalidateQueries({ queryKey: ["whatsapp-reminders-sent"] })
      setSelectedId(null)
    },
  })

  const handleApprove = useCallback(async (id: string) => {
    setApproveLoading(true)
    try {
      await approveMutation.mutateAsync(id)
    } finally {
      setApproveLoading(false)
    }
  }, [approveMutation])

  if (!isAdmin) return null

  const pendingCount = pendingEntries?.length ?? 0
  const totalSent = sentData?.count ?? 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-600">
              <Clock className="h-5 w-5" />
              <span className="text-2xl font-bold">{pendingCount}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t("notifications.pendingCount")?.replace("{n}", String(pendingCount))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-2xl font-bold">{totalSent}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t("notifications.sentCount")?.replace("{n}", String(totalSent))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-600">
              <Send className="h-5 w-5" />
              <span className="text-2xl font-bold">{pendingCount + totalSent}</span>
            </div>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      <h3 className="text-lg font-semibold">{t("notifications.reminders")}</h3>
      {pendingLoading && <p className="text-sm text-muted-foreground">Chargement...</p>}
      {!pendingLoading && pendingCount === 0 && (
        <p className="text-sm text-muted-foreground">{t("notifications.noPending")}</p>
      )}
      <div className="space-y-2">
        {(pendingEntries as WhatsappOutbox[] | undefined)?.map((entry) => (
          <Card key={entry.id} className="flex items-center justify-between p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{entry.member_name}</span>
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  {entry.delay_label ?? t("notifications.delayLabel")}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{entry.phone ?? "—"}</span>
                <span>·</span>
                <span>{entry.scheduled_for ?? ""}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="border-amber-500 text-amber-600">
                {t("notifications.pendingApproval")}
              </Badge>
              <Button
                size="sm"
                onClick={() => setSelectedId(entry.id)}
                disabled={approveLoading && selectedId === entry.id}
              >
                {approveLoading && selectedId === entry.id ? (
                  <X className="h-4 w-4 animate-spin" />
                ) : (
                  t("notifications.approveAndSend")
                )}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("notifications.reminders")}</DialogTitle>
            <DialogDescription>
              Confirmer l'envoi du message WhatsApp ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              {t("notifications.cancelApprove")}
            </Button>
            <Button onClick={() => selectedId && handleApprove(selectedId)} disabled={approveLoading}>
              {approveLoading ? "Envoi..." : t("notifications.approveAndSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}