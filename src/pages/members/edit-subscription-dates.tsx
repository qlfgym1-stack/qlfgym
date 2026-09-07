import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@/hooks/useQuery'
import { useSupabase } from '@/hooks/useSupabase'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Loader2, CalendarClock } from 'lucide-react'
import type { Member } from '@/types/supabase'

interface EditSubscriptionDatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: Member
  subscriptionId: string
  memberName: string
  currentStart: string
  currentEnd: string
}

function labelStyle(): string {
  return 'block text-sm font-medium text-foreground mb-1.5'
}

export function EditSubscriptionDatesDialog({
  open,
  onOpenChange,
  member,
  subscriptionId,
  memberName,
  currentStart,
  currentEnd,
}: EditSubscriptionDatesDialogProps) {
  const t = useT()
  const supabase = useSupabase()
  const { organization } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const orgId = organization?.id

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStartDate(currentStart || '')
      setEndDate(currentEnd || '')
      setError(null)
    }
  }, [open, currentStart, currentEnd])

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
      if (!orgId || !subscriptionId) throw new Error('missing context')
      const { data, error: err } = await (supabase.rpc as any)('update_subscription_dates', {
        p_subscription_id: subscriptionId,
        p_organization_id: orgId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
      if (err) throw err
      const payload = data as { success?: boolean } | null
      if (!payload?.success) throw new Error('RPC failed')
      return payload
    },
    onSuccess: () => {
      invalidate()
      toast({ title: t('members.profile.editSubscriptionSuccess') || 'Dates d’abonnement mises à jour' })
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      setError(t('members.profile.editSubscriptionError') || 'Erreur lors de la mise à jour')
      console.error('update_subscription_dates', message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            {t('members.profile.editSubscriptionDateTitle') || 'Modifier la date d’abonnement'}
          </DialogTitle>
          <DialogDescription>
            {t('members.profile.editSubscriptionDateFor') || 'Abonnement de'}
            {' '}{memberName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className={labelStyle()}>
              {t('subscriptions.startDate') || 'Début abon'}
            </label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className={labelStyle()}>
              {t('subscriptions.endDate') || 'Fin abon'}
            </label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel') || 'Annuler'}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t('common.save') || 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
