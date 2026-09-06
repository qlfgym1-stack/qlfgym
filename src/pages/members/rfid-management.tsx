import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@/hooks/useQuery'
import { useSupabase } from '@/hooks/useSupabase'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Shield, ShieldAlert, ShieldCheck, History, RotateCcw, XCircle, Radio } from 'lucide-react'
import type { RfidCard, RfidCardAudit } from '@/types/supabase'

const RFID_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIF: { label: 'RFID ACTIF', color: 'bg-success/10 text-success border-success/30' },
  REMPLACÉ: { label: 'RFID REMPLACÉ', color: 'bg-accent/10 text-accent border-accent/30' },
  DÉSACTIVÉ: { label: 'RFID DÉSACTIVÉ', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  PERDU: { label: 'RFID PERDU', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  VOLÉ: { label: 'RFID VOLÉ', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  BLACKLISTÉ: { label: 'RFID BLACKLISTÉ', color: 'bg-muted text-muted-foreground border-muted-foreground/30' },
  ARCHIVÉ: { label: 'RFID ARCHIVÉ', color: 'bg-muted text-muted-foreground border-muted-foreground/30' },
}

const REPLACE_REASONS = ['Badge perdu', 'Badge volé', 'Badge endommagé', 'Badge illisible', 'Changement administratif', 'Autre']

interface RfidManagementDialogProps {
  memberId: string
  memberName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RfidManagementDialog({ memberId, memberName, open, onOpenChange }: RfidManagementDialogProps) {
  const t = useT()
  const supabase = useSupabase()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [showReplace, setShowReplace] = useState(false)
  const [newRfidUid, setNewRfidUid] = useState('')
  const [replaceReason, setReplaceReason] = useState('')
  const [replaceNotes, setReplaceNotes] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['member-rfid', memberId],
    queryFn: async () => {
      if (!memberId) return { active_card: null, cards: [], audit_log: [] }
      const { data, error } = await (supabase.rpc as any)('get_member_rfid_history', { p_member_id: memberId })
      if (error) throw error
      return data as { active_card: RfidCard | null; cards: RfidCard[]; audit_log: RfidCardAudit[] }
    },
    enabled: open && !!memberId,
  })

  const activeCard = data?.active_card
  const cards = data?.cards || []
  const auditLog = data?.audit_log || []

  const replaceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)('replace_rfid_card', {
        p_member_id: memberId,
        p_old_rfid_uid: activeCard?.rfid_uid,
        p_new_rfid_uid: newRfidUid.trim(),
        p_reason: replaceReason,
        p_notes: replaceNotes || null,
        p_created_by: user?.id || null,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['members'] })
      setShowReplace(false)
      setNewRfidUid('')
      setReplaceReason('')
      setReplaceNotes('')
      toast({ title: 'Badge remplacé avec succès' })
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erreur', description: err.message }),
  })

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      if (!activeCard) throw new Error('Aucun badge actif')
      const { data, error } = await (supabase.rpc as any)('deactivate_rfid_card', {
        p_rfid_uid: activeCard.rfid_uid,
        p_reason: 'Désactivation manuelle',
        p_created_by: user?.id || null,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
    },
    onSuccess: () => { refetch(); toast({ title: 'Badge désactivé' }) },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erreur', description: err.message }),
  })

  const activateMutation = useMutation({
    mutationFn: async (rfidUid: string) => {
      const { data, error } = await (supabase.rpc as any)('reactivate_rfid_card', {
        p_rfid_uid: rfidUid.trim(),
        p_reason: 'Réactivation manuelle',
        p_created_by: user?.id || null,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
    },
    onSuccess: () => { refetch(); toast({ title: 'Badge réactivé' }) },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erreur', description: err.message }),
  })

  async function handleCheckRfid() {
    if (!newRfidUid) return
    const { data } = await (supabase.rpc as any)('check_rfid_available', { p_rfid_uid: newRfidUid.trim() })
    if (data?.available === false) {
      toast({ variant: 'destructive', title: 'Badge indisponible', description: data.member_name ? `Attribué à ${data.member_name}` : `Statut: ${data.status}` })
      return
    }
    toast({ title: 'Badge disponible' })
  }

  function getStatusBadge(status: string) {
    const info = RFID_STATUS_LABELS[status] || { label: status, color: 'bg-gray-500/10 text-gray-400' }
    return <Badge className={info.color + ' border'}>{info.label}</Badge>
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Gestion RFID — {memberName}</DialogTitle>
          <DialogDescription>
            Gérez les badges RFID de cet adhérent
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6 py-1">
            {/* Current RFID Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Badge actuel
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeCard ? (
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(activeCard.status)}
                        <Badge variant="outline" className="font-mono text-xs">{activeCard.rfid_uid}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Attribué le {new Date(activeCard.assigned_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowReplace(true)}>
                        <RotateCcw className="mr-1 h-3 w-3" /> Remplacer
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deactivateMutation.mutate()}>
                        <XCircle className="mr-1 h-3 w-3" /> Désactiver
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun badge RFID actif</p>
                )}
              </CardContent>
            </Card>

            {/* History */}
            {cards.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    Historique des badges
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>RFID</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Attribué le</TableHead>
                        <TableHead>Motif</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cards.map((card: RfidCard) => (
                        <TableRow key={card.id}>
                          <TableCell className="font-mono text-xs">{card.rfid_uid}</TableCell>
                          <TableCell>{getStatusBadge(card.status)}</TableCell>
                          <TableCell className="text-xs">{new Date(card.assigned_at).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell className="text-xs">{card.reason || '-'}</TableCell>
                          <TableCell>
                            {card.status === 'DÉSACTIVÉ' && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => activateMutation.mutate(card.rfid_uid)}>
                                <Radio className="mr-1 h-3 w-3" /> Réactiver
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Audit Log */}
            {auditLog.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    Journal d'audit
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Ancien RFID</TableHead>
                        <TableHead>Nouveau RFID</TableHead>
                        <TableHead>Motif</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLog.map((log: RfidCardAudit) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">{new Date(log.created_at).toLocaleDateString('fr-FR')}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{log.action}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{log.old_rfid_uid || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">{log.new_rfid_uid}</TableCell>
                          <TableCell className="text-xs">{log.reason || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        </div>

        {/* Replace Dialog */}
        <Dialog open={showReplace} onOpenChange={setShowReplace}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Remplacer le badge RFID</DialogTitle>
              <DialogDescription>
                Ancien RFID : <span className="font-mono text-primary">{activeCard?.rfid_uid}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Nouveau RFID</label>
                <div className="flex gap-2">
                  <Input
                    value={newRfidUid}
                    onChange={(e) => setNewRfidUid(e.target.value)}
                    placeholder="Scanner ou saisir le nouveau badge"
                    className="h-10 font-mono"
                  />
                  <Button variant="outline" size="sm" onClick={handleCheckRfid}>Vérifier</Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Motif</label>
                <Select value={replaceReason} onValueChange={setReplaceReason}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Sélectionner un motif" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPLACE_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {replaceReason === 'Autre' && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Commentaire *</label>
                  <Input
                    value={replaceNotes}
                    onChange={(e) => setReplaceNotes(e.target.value)}
                    placeholder="Motif détaillé obligatoire"
                    className="h-10"
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowReplace(false)}>Annuler</Button>
              <Button
                onClick={() => replaceMutation.mutate()}
                disabled={!newRfidUid || !replaceReason || replaceMutation.isPending}
              >
                {replaceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmer le remplacement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface RfidCreateSectionProps {
  rfidUid: string
  onRfidChange: (uid: string) => void
}

export function RfidCreateSection({ rfidUid, onRfidChange }: RfidCreateSectionProps) {
  const { toast } = useToast()
  const supabase = useSupabase()

  async function handleCheckRfid() {
    if (!rfidUid) {
      toast({ title: 'Saisissez un RFID' })
      return
    }
    const { data } = await (supabase.rpc as any)('check_rfid_available', { p_rfid_uid: rfidUid })
    if (data?.available === false) {
      toast({ variant: 'destructive', title: 'Badge déjà utilisé', description: data.member_name || `Statut: ${data.status}` })
      return
    }
    toast({ title: 'Badge disponible ✓' })
  }

  return (
    <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Shield className="h-4 w-4 text-primary" />
        RFID
      </div>
      <div className="flex gap-2">
        <Input
          value={rfidUid}
          onChange={(e) => onRfidChange(e.target.value)}
          placeholder="Numéro RFID (lecture automatique ou saisie)"
          className="flex-1 h-10 font-mono text-xs"
        />
        <Button variant="outline" size="sm" onClick={handleCheckRfid} type="button">
          <Radio className="mr-1 h-3 w-3" /> Vérifier
        </Button>
      </div>
    </div>
  )
}
