import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/i18n'
import { Loader2 } from 'lucide-react'
import type { AssignmentCoach } from '../hooks/useCoachAssignmentData'

interface AssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Nombre de membres sélectionnés dans la liste. */
  selectedCount: number
  /** Destination : un coach, ou `unassigned` pour désaffecter. */
  target: 'unassigned' | string
  targetCoach: AssignmentCoach | undefined
  onConfirm: (reason: string | null) => void
  isPending: boolean
}

export function AssignDialog({
  open,
  onOpenChange,
  selectedCount,
  target,
  targetCoach,
  onConfirm,
  isPending,
}: AssignDialogProps) {
  const t = useT()
  const [reason, setReason] = useState('')

  const isUnassign = target === 'unassigned'
  const targetLabel = isUnassign
    ? t('coachAssignment.coaches.unassigned')
    : targetCoach
      ? `${targetCoach.first_name} ${targetCoach.last_name}`
      : '—'

  const close = () => {
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isUnassign
              ? t('coachAssignment.dialog.unassignTitle').replace('{count}', String(selectedCount))
              : t('coachAssignment.dialog.assignTitle').replace('{count}', String(selectedCount))}
          </DialogTitle>
          <DialogDescription>{t('coachAssignment.dialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border p-3">
            <span className="text-sm text-muted-foreground">{t('coachAssignment.dialog.target')}</span>
            <Badge variant="secondary" className="ml-auto">
              {targetLabel}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="assign-reason" className="text-sm font-medium">
              {t('coachAssignment.dialog.reasonLabel')}
            </label>
            <Textarea
              id="assign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('coachAssignment.dialog.reasonPlaceholder')}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              {t('coachAssignment.dialog.reasonHint')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isPending}>
            {t('coachAssignment.dialog.cancel')}
          </Button>
          <Button
            variant={isUnassign ? 'destructive' : 'default'}
            onClick={() => onConfirm(reason.trim() || null)}
            disabled={isPending || selectedCount === 0}
          >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {isUnassign
              ? t('coachAssignment.dialog.confirmUnassign')
              : t('coachAssignment.dialog.confirmAssign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}