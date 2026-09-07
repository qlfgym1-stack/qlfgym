import { useMemo, useState } from 'react'
import { useQuery } from '@/hooks/useQuery'
import { useSupabase } from '@/hooks/useSupabase'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { IS_MOCK } from '@/lib/config'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Loader2, User, Mail, Phone, MapPin, Cake, Siren, NotebookPen, UserRound, Banknote, CalendarCheck2, ShoppingCart, History, Shield, UserCheck, CreditCard, CalendarClock } from 'lucide-react'
import { formatDate, formatCurrency, formatDateTime, getInitials, getStatusColor, toUpper, memberFullName, displayPhone } from '@/lib/utils'
import type { Member } from '@/types/supabase'
import { EditSubscriptionDatesDialog } from './edit-subscription-dates'

interface MemberProfileDialogProps {
  member: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onShowHistory: (member: Member) => void
  onEdit: (member: Member) => void
  onShowRfid: (member: Member) => void
}

interface ProfileStats {
  currentSub: {
    id: string | null
    name: string
    status: string
    start_date: string
    end_date: string
    total_amount: number
    amount_paid: number
  } | null
  paymentsCount: number
  paymentsTotal: number
  attendanceCount: number
  posTotal: number
  coach: { id: string; first_name: string; last_name: string } | null
  rfidUid: string | null
  recentAttendance: { id: string; check_in: string | null; check_out: string | null }[]
  recentPos: { id: string; total: number; created_at: string }[]
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium break-words">{value || '—'}</p>
      </div>
    </div>
  )
}

function stayLabel(a: { check_in: string | null; check_out: string | null }) {
  if (!a.check_in) return '—'
  const end = a.check_out ? new Date(a.check_out).getTime() : Date.now()
  const mins = Math.floor((end - new Date(a.check_in).getTime()) / 60000)
  if (mins < 0) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function MemberProfileDialog({ member, open, onOpenChange, onShowHistory, onEdit, onShowRfid }: MemberProfileDialogProps) {
  const t = useT()
  const supabase = useSupabase()
  const { organization, roles } = useAuth()
  const orgId = organization?.id
  const [editDatesOpen, setEditDatesOpen] = useState(false)
  const canEditSubscriptionDates = !!orgId && (roles ?? []).some((r) => r.organization_id === orgId && (r.role === 'admin' || r.role === 'receptionist'))

  const { data: stats, isLoading } = useQuery({
    queryKey: ['member-profile', member?.id],
    queryFn: async (): Promise<ProfileStats> => {
      if (!member) return { currentSub: null, paymentsCount: 0, paymentsTotal: 0, attendanceCount: 0, posTotal: 0, coach: null, rfidUid: null, recentAttendance: [], recentPos: [] }
      if (IS_MOCK) {
        return {
          currentSub: { id: null, name: '1 Mois', status: 'active', start_date: new Date().toISOString(), end_date: new Date(Date.now() + 86400000 * 30).toISOString(), total_amount: 2400, amount_paid: 2400 },
          paymentsCount: 3,
          paymentsTotal: 7200,
          attendanceCount: 12,
          posTotal: 0,
          coach: null,
          rfidUid: 'RFID-0001',
          recentAttendance: [
            { id: 'a1', check_in: new Date(Date.now() - 86400000).toISOString(), check_out: new Date(Date.now() - 86400000 + 7200000).toISOString() },
            { id: 'a2', check_in: new Date(Date.now() - 2 * 86400000).toISOString(), check_out: new Date(Date.now() - 2 * 86400000 + 5400000).toISOString() },
          ],
          recentPos: [{ id: 'p1', total: 600, created_at: new Date(Date.now() - 86400000).toISOString() }],
        }
      }
      const [subs, payments, attendance, pos, rfid] = await Promise.all([
        supabase
          .from('member_subscriptions')
          .select('id, subscription_type_id, subscription_types!inner(name), start_date, end_date, total_amount, amount_paid, status')
          .eq('member_id', member.id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('payments')
          .select('amount, status')
          .eq('member_id', member.id)
          .eq('status', 'completed'),
        supabase
          .from('attendance')
          .select('id, check_in, check_out')
          .eq('member_id', member.id)
          .order('check_in', { ascending: false })
          .limit(5),
        supabase
          .from('pos_transactions')
          .select('total, created_at')
          .eq('member_id', member.id)
          .is('cancelled_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('rfid_cards')
          .select('rfid_uid')
          .eq('member_id', member.id)
          .eq('status', 'ACTIF')
          .maybeSingle(),
      ])

      const subRow = (subs.data ?? [])[0] as any
      const pays = (payments.data ?? []) as any[]
      const posRows = (pos.data ?? []) as any[]
      const recentAttendance = ((attendance.data ?? []) as any[]).map((a: any) => ({ id: a.id, check_in: a.check_in ?? null, check_out: a.check_out ?? null }))
      const recentPos = posRows.map((p: any) => ({ id: p.id ?? p.total, total: Number(p.total || 0), created_at: p.created_at ?? '' }))

      let coach: { id: string; first_name: string; last_name: string } | null = null
      if (member.coach_id && orgId) {
        try {
          const { data: roster } = await (supabase.rpc as any)('get_staff_roster', { p_org_id: orgId })
          coach = (roster ?? []).find((s: { id: string }) => s.id === member.coach_id) ?? null
        } catch {
          coach = null
        }
      }

      return {
        currentSub: subRow
          ? {
              id: subRow.id,
              name: subRow.subscription_types?.name || '—',
              status: subRow.status,
              start_date: subRow.start_date,
              end_date: subRow.end_date,
              total_amount: subRow.total_amount,
              amount_paid: subRow.amount_paid,
            }
          : null,
        paymentsCount: pays.length,
        paymentsTotal: pays.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0),
        attendanceCount: (attendance.data ?? []).length,
        posTotal: posRows.reduce((acc: number, p: any) => acc + Number(p.total || 0), 0),
        coach,
        rfidUid: (rfid.data as { rfid_uid?: string } | null)?.rfid_uid ?? null,
        recentAttendance,
        recentPos,
      }
    },
    enabled: !!orgId && !!member && open,
  })

  const sub = stats?.currentSub
  const subStatusVariant = useMemo(() => {
    switch (sub?.status) {
      case 'active': return 'bg-success/10 text-success border-success/30'
      case 'pending_payment': return 'bg-warning/10 text-warning border-warning/30'
      case 'expired': return 'bg-muted text-muted-foreground border-muted-foreground/30'
      default: return 'bg-destructive/10 text-destructive border-destructive/30'
    }
  }, [sub?.status])

  const subStatusLabel = useMemo(() => {
    switch (sub?.status) {
      case 'active': return t('members.profile.statusActive') || 'Actif'
      case 'pending_payment': return t('members.profile.statusPending') || 'En attente'
      case 'expired': return t('members.profile.statusExpired') || 'Expiré'
      default: return t('members.profile.statusCancelled') || 'Annulé'
    }
  }, [sub?.status, t])

  if (!member) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarImage src={member.photo_url ?? undefined} />
              <AvatarFallback>{getInitials(member.first_name, member.last_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate">{toUpper(memberFullName(member))}</p>
              <p className="text-xs font-normal text-muted-foreground">
                {t('members.profile.memberNumber') || 'N°'} {member.member_number ?? '—'}
              </p>
            </div>
            <Badge className={`ml-auto shrink-0 ${getStatusColor(member.status)}`}>{toUpper(member.status)}</Badge>
          </DialogTitle>
          <DialogDescription className="sr-only">Fiche membre</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto -mx-6 px-6 pb-2 space-y-5">
          {isLoading && (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          )}
          {!isLoading && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={Mail} label={t('members.email') || 'E-mail'} value={member.email} />
                <InfoRow icon={Phone} label={t('members.phone') || 'Téléphone'} value={displayPhone(member.phone)} />
                <InfoRow icon={Cake} label={t('members.birthDate') || 'Date de naissance'} value={member.birth_date ? formatDate(member.birth_date) : null} />
                <InfoRow icon={UserRound} label={t('members.gender') || 'Genre'} value={member.gender ? (member.gender === 'male' ? t('members.male') || 'Homme' : t('members.female') || 'Femme') : null} />
                <InfoRow icon={MapPin} label={t('members.address') || 'Adresse'} value={member.address} />
                <InfoRow icon={CalendarCheck2} label={t('members.lastVisit') || 'Dernière visite'} value={member.last_visit ? formatDate(member.last_visit) : null} />
                <InfoRow icon={User} label={t('members.profile.memberSince') || 'Membre depuis'} value={member.created_at ? formatDate(member.created_at) : null} />
                <InfoRow icon={UserCheck} label={t('members.profile.coach') || 'Coach'} value={stats?.coach ? `${stats.coach.first_name} ${stats.coach.last_name}` : null} />
                <InfoRow icon={CreditCard} label={t('members.profile.rfidUid') || 'Badge RFID'} value={stats?.rfidUid ? stats.rfidUid : null} />
                <InfoRow icon={Siren} label={t('members.emergencyContact') || 'Contact d’urgence'} value={member.emergency_contact ? `${member.emergency_contact}${member.emergency_phone ? ` · ${displayPhone(member.emergency_phone)}` : ''}` : null} />
              </div>

              {member.notes && (
                <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-3">
                  <NotebookPen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground break-words">{member.notes}</p>
                </div>
              )}

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">{t('members.subscriptions') || 'Abonnement'}</p>
                  <div className="flex items-center gap-2">
                    {canEditSubscriptionDates && sub?.id && (
                      <button
                        type="button"
                        onClick={() => setEditDatesOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                        title={t('members.profile.editSubscriptionDate') || 'Modifier la date d’abonnement'}
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        {t('members.profile.editSubscriptionDate') || 'Modifier la date'}
                      </button>
                    )}
                    <Badge className={subStatusVariant}>{subStatusLabel}</Badge>
                  </div>
                </div>
                {sub ? (
                  <Card className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{sub.name}</p>
                      <p className="text-sm font-bold">{formatCurrency(sub.total_amount)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(sub.start_date)} → {formatDate(sub.end_date)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">{t('members.profile.amountPaid') || 'Payé'} : {formatCurrency(sub.amount_paid)}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('members.profile.remaining') || 'Reste'} : {formatCurrency(sub.total_amount - sub.amount_paid)}
                      </p>
                    </div>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('members.profile.noSubscription') || 'Aucun abonnement'}</p>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-3 text-center">
                  <Banknote className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-lg font-bold">{formatCurrency(stats?.paymentsTotal ?? 0)}</p>
                  <p className="text-[11px] text-muted-foreground">{t('members.profile.totalPaid') || 'Total payé'}</p>
                </Card>
                <Card className="p-3 text-center">
                  <History className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-lg font-bold">{stats?.paymentsCount ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">{t('members.profile.payments') || 'Paiements'}</p>
                </Card>
                <Card className="p-3 text-center">
                  <CalendarCheck2 className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-lg font-bold">{stats?.attendanceCount ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">{t('members.attendance') || 'Présences'}</p>
                </Card>
                <Card className="p-3 text-center">
                  <ShoppingCart className="h-4 w-4 mx-auto mb-1 text-primary" />
                  <p className="text-lg font-bold">{formatCurrency(stats?.posTotal ?? 0)}</p>
                  <p className="text-[11px] text-muted-foreground">{t('members.profile.posTotal') || 'Achats POS'}</p>
                </Card>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="p-3">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <CalendarCheck2 className="h-4 w-4 text-primary" />
                    {t('members.profile.recentAttendance') || 'Dernières présences'}
                  </p>
                  {!stats?.recentAttendance || stats.recentAttendance.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('members.profile.noData') || 'Aucune donnée'}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {stats.recentAttendance.map((a: { id: string; check_in: string | null; check_out: string | null }) => (
                        <li key={a.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{a.check_in ? formatDate(a.check_in) : '—'}</span>
                          <span className="font-mono font-medium">{stayLabel(a)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card className="p-3">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    {t('members.profile.recentPos') || 'Derniers achats'}
                  </p>
                  {!stats?.recentPos || stats.recentPos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('members.profile.noData') || 'Aucune donnée'}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {stats.recentPos.map((p: { id: string; total: number; created_at: string }) => (
                        <li key={p.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{p.created_at ? formatDate(p.created_at) : '—'}</span>
                          <span className="font-medium">{formatCurrency(p.total)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                  onClick={() => onShowRfid(member)}
                >
                  <Shield className="h-4 w-4" />
                  {t('members.profile.rfid') || 'Badge RFID'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                  onClick={() => onShowHistory(member)}
                >
                  <History className="h-4 w-4" />
                  {t('members.history.title') || 'Historique'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                  onClick={() => onEdit(member)}
                >
                  {t('members.edit') || 'Modifier le membre'}
                </button>
              </div>
            </>
          )}
        </div>
        </DialogContent>
      </Dialog>

      {member && stats?.currentSub?.id && (
        <EditSubscriptionDatesDialog
          open={editDatesOpen}
          onOpenChange={setEditDatesOpen}
          member={member}
          subscriptionId={stats.currentSub.id}
          memberName={memberFullName(member)}
          currentStart={stats.currentSub.start_date}
          currentEnd={stats.currentSub.end_date}
        />
      )}
    </>
  )
}
