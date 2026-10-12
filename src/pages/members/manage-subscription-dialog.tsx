import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@/hooks/useQuery'
import { useMutation, useQueryClient } from '@/hooks/useQuery'
import { useSupabase } from '@/hooks/useSupabase'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, CalendarClock, PlusCircle, PencilLine } from 'lucide-react'
import { IS_MOCK } from '@/lib/config'
import { computeSubscriptionStatus } from '@/lib/subscription-status'
import { formatCurrency } from '@/lib/utils'
import type { Member, SubscriptionType } from '@/types/supabase'

interface ManageSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: Member
  memberName: string
  currentSub: {
    id: string
    subscription_type_id: string
    name: string
    status: string
    start_date: string | null
    end_date: string | null
  } | null
}

const MOCK_TYPES: Partial<SubscriptionType>[] = [
  { id: 'mock-st-2', name: '1 Mois', duration_days: 30, price: 2400 },
  { id: 'mock-st-3', name: '3 Mois', duration_days: 90, price: 6600 },
  { id: 'mock-st-5', name: '12 Mois', duration_days: 365, price: 22800 },
]

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

export function ManageSubscriptionDialog({
  open,
  onOpenChange,
  member,
  memberName,
  currentSub,
}: ManageSubscriptionDialogProps) {
  const t = useT()
  const supabase = useSupabase()
  const { organization } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const orgId = organization?.id
  const isAssign = !currentSub

  const [typeId, setTypeId] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: subscriptionTypes = [] } = useQuery({
    queryKey: ['subscription-types', orgId],
    queryFn: async () => {
      if (!orgId) return []
      if (IS_MOCK) return MOCK_TYPES as SubscriptionType[]
      const { data } = await supabase.from('subscription_types').select('*').eq('organization_id', orgId).eq('is_active', true).eq('is_drop_in', false).order('name')
      return (data ?? []) as SubscriptionType[]
    },
    enabled: !!orgId,
  })

  useEffect(() => {
    if (open) {
      setTypeId(currentSub?.subscription_type_id ?? '')
      setStartDate(currentSub?.start_date ?? todayIso())
      setEndDate(currentSub?.end_date ?? '')
      setError(null)
    }
  }, [open, currentSub])

  const selectedType = useMemo(() => subscriptionTypes.find((st: SubscriptionType) => st.id === typeId), [subscriptionTypes, typeId])

  const onTypeChange = (value: string) => {
    setTypeId(value)
    setError(null)
    if (isAssign && !endDate) {
      const typeDef = subscriptionTypes.find((st: SubscriptionType) => st.id === value)
      if (typeDef) {
        const end = new Date(startDate)
        end.setDate(end.getDate() + typeDef.duration_days)
        setEndDate(end.toISOString().split('T')[0])
      }
    }
  }

  const previewStatus = useMemo(() => {
    return computeSubscriptionStatus({
      currentStatus: isAssign ? null : ((currentSub?.status as 'active' | 'expired' | 'cancelled' | 'pending_payment' | null) ?? null),
      startDate,
      endDate,
      today: todayIso(),
    })
  }, [isAssign, currentSub, startDate, endDate])

  const invalidate = () => {
    const org = orgId
    const keys = [
      ['member-subscriptions-map', org],
      ['members'],
      ['members-list'],
      ['members-active'],
      ['inactive-members'],
      ['expiring-subscriptions'],
      ['dashboard-stats'],
      ['member-profile', member.id],
    ].filter((k) => !k.some((v) => v === undefined || v === null || v === '')) as string[][]
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !typeId) throw new Error('missing context')
      if (IS_MOCK) return { success: true, mode: isAssign ? 'assign' : 'update' }
      const { data, error: err } = await (supabase.rpc as any)('admin_manage_subscription', {
        p_organization_id: orgId,
        p_member_id: member.id,
        p_subscription_type_id: typeId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_subscription_id: isAssign ? null : currentSub?.id,
      })
      if (err) throw err
      const payload = data as { success?: boolean } | null
      if (!payload?.success) throw new Error('RPC failed')
      return payload
    },
    onSuccess: () => {
      invalidate()
      toast({ title: isAssign ? (t('members.profile.manageSubscriptionAssigned') || 'Abonnement attribué') : (t('members.profile.manageSubscriptionUpdated') || 'Abonnement mis à jour') })
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      setError(t('members.profile.manageSubscriptionError') || 'Erreur lors de l’enregistrement de l’abonnement')
      console.error('admin_manage_subscription', message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!typeId) {
      setError(t('members.profile.manageSubscriptionTypeRequired') || 'Le type d’abonnement est obligatoire')
      return
    }
    if (!startDate || !endDate) {
      setError(t('members.profile.editSubscriptionRequired') || 'Les deux dates sont obligatoires')
      return
    }
    if (startDate > endDate) {
      setError(t('members.profile.editSubscriptionOrder') || 'La date de début doit précéder la date de fin')
      return
    }
    mutation.mutate()
  }

  const statusVariant = previewStatus === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300' : previewStatus === 'expired' ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300' : 'bg-muted text-muted-foreground'
  const statusLabel = previewStatus === 'active' ? (t('members.profile.statusActive') || 'Actif') : previewStatus === 'expired' ? (t('members.profile.statusExpired') || 'Expiré') : previewStatus === 'pending_payment' ? (t('members.profile.statusPending') || 'En attente') : previewStatus === 'cancelled' ? (t('members.profile.statusCancelled') || 'Annulé') : '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAssign ? <PlusCircle className="h-5 w-5 text-primary" /> : <PencilLine className="h-5 w-5 text-primary" />}
            {isAssign ? (t('members.profile.manageSubscriptionAssignTitle') || 'Attribuer un abonnement') : (t('members.profile.manageSubscriptionEditTitle') || 'Modifier l’abonnement')}
          </DialogTitle>
          <DialogDescription>
            {t('members.profile.editSubscriptionDateFor') || 'Abonnement de'}
            {' '}{memberName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label className="mb-1.5 block text-sm font-medium">
              {t('subscriptions.type') || 'Type d’abonnement'}
            </Label>
            <Select value={typeId} onValueChange={onTypeChange}>
              <SelectTrigger><SelectValue placeholder={t('common.all') || 'Tout'} /></SelectTrigger>
              <SelectContent>
                {(subscriptionTypes as SubscriptionType[]).map((st) => (
                  <SelectItem key={st.id} value={st.id}>{st.name} — {formatCurrency(st.price)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && <p className="mt-1 text-xs text-muted-foreground">{selectedType.description} · {selectedType.duration_days} {t('subscriptions.days') || 'jours'}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-sm font-medium">
                {t('subscriptions.startDate') || 'Début abon'}
              </Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm font-medium">
                {t('subscriptions.endDate') || 'Fin abon'}
              </Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {!isAssign && (
            <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">
              {t('members.profile.manageSubscriptionNoAmountNotice') || 'Les montants déjà payés et l’historique ne sont pas modifiés.'}
            </p>
          )}
          <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">
            {t('members.profile.manageSubscriptionNoPaymentNotice') || 'Aucun paiement n’est créé automatiquement : le règlement reste à enregistrer via le POS.'}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-sm">{t('members.profile.manageSubscriptionPreview') || 'Statut prévu'}</span>
            <Badge className={statusVariant}>{statusLabel}</Badge>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
              {t('common.cancel') || 'Annuler'}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isAssign ? (t('members.profile.manageSubscriptionAssign') || 'Attribuer') : (t('common.save') || 'Enregistrer')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}