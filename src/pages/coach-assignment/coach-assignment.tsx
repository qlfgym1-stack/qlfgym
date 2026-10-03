import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@/hooks/useQuery'
import { useMutation } from '@/hooks/useQuery'
import { useSupabase } from '@/hooks/useSupabase'
import { useAuth } from '@/stores/auth'
import { PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/i18n'
import { Loader2, ShieldAlert, UserCheck, UserX } from 'lucide-react'
import { toUpper } from '@/lib/utils'
import { emptyCategoryCounts, type MemberCategory } from '@/lib/member-category'
import {
  DEFAULT_ASSIGNMENT_FILTERS,
  useCoachAssignmentData,
  type AssignmentFilters,
  type CoachFilter,
} from './hooks/useCoachAssignmentData'
import { CategoryFilter } from './components/category-filter'
import { CoachPanel } from './components/coach-panel'
import { MemberTable } from './components/member-table'
import { AssignDialog } from './components/assign-dialog'

interface AssignResult {
  member_id: string
  success: boolean
  info: string
}

interface AssignVariables {
  memberIds: string[]
  coachId: string | null
  reason: string | null
}

export default function CoachAssignmentPage() {
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { organization, roles } = useAuth()
  const { toast } = useToast()
  const t = useT()

  const orgId = organization?.id
  const isAdmin = roles.some((r) => r.role === 'admin')

  const [filters, setFilters] = useState<AssignmentFilters>(DEFAULT_ASSIGNMENT_FILTERS)
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)

  const {
    coaches,
    unassignedCounts,
    unassignedTotal,
    members,
    totalMembers,
    totalPages,
    isLoading,
    isLoadingMembers,
  } = useCoachAssignmentData(orgId, filters, page)

  // Un changement de filtre rend la page courante invalide : on revient ÃƒÂ  la
  // premiÃƒÂ¨re, sinon on peut atterrir sur une page vide aprÃƒÂ¨s avoir filtrÃƒÂ©.
  useEffect(() => {
    setPage(0)
  }, [filters.categories, filters.coachId, filters.status, filters.search])

  const targetCoach = useMemo(
    () => coaches.find((c: (typeof coaches)[number]) => c.id === filters.coachId),
    [coaches, filters.coachId]
  )
  const isUnassignTarget = filters.coachId === 'unassigned'
  const canAct = filters.coachId !== 'all'

  /**
   * Les compteurs affichÃƒÂ©s sur les pastilles doivent correspondre ÃƒÂ  la liste
   * rÃƒÂ©ellement affichÃƒÂ©e. Sur Ã‚Â« non affectÃƒÂ©s Ã‚Â», ce sont les compteurs dÃƒÂ©diÃƒÂ©s ; sur
   * un coach, son tableau croisÃƒÂ© ; sur Ã‚Â« tous Ã‚Â», les compteurs globaux.
   */
  const categoryCounts = useMemo(() => {
    if (filters.coachId === 'unassigned') return unassignedCounts
    if (targetCoach) {
      return {
        adult_male: targetCoach.adult_male_count,
        adult_female: targetCoach.adult_female_count,
        boy: targetCoach.boy_count,
        girl: targetCoach.girl_count,
        unknown: targetCoach.unknown_count,
      }
    }
    return emptyCategoryCounts()
  }, [filters.coachId, targetCoach, unassignedCounts])

  const toggleCategory = (category: MemberCategory) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }))
    // Un changement de filtre invalide la sÃƒÂ©lection courante : elle porte sur
    // des lignes qui ne sont plus visibles.
    setSelectedIds(new Set())
  }

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Ajoute les ids non dÃƒÂ©jÃƒÂ  sÃƒÂ©lectionnÃƒÂ©s, ou retire ceux qui le sont tous. */
  const togglePage = (ids: string[]) => {
    setSelectedIds((prev) => {
      const allPresent = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      for (const id of ids) {
        if (allPresent) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const assignMutation = useMutation({
    mutationFn: async ({ memberIds, coachId, reason }: AssignVariables): Promise<AssignResult[]> => {
      const { data, error } = await (supabase.rpc as any)('assign_members_to_coach', {
        p_member_ids: memberIds,
        p_coach_id: coachId,
        p_reason: reason,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as AssignResult[]
    },
    onSuccess: async (rows: AssignResult[], variables: AssignVariables) => {
      const ok = rows.filter((r) => r.success).length
      const ko = rows.length - ok
      if (ok > 0) {
        toast({
          title: variables.coachId
            ? t('coachAssignment.toast.assigned').replace('{count}', String(ok))
            : t('coachAssignment.toast.unassigned').replace('{count}', String(ok)),
        })
      }
      if (ko > 0) {
        toast({
          title: t('coachAssignment.toast.partial').replace('{failed}', String(ko)),
          variant: 'destructive',
        })
      }
      setSelectedIds(new Set())
      setDialogOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignment-coaches'] }),
        queryClient.invalidateQueries({ queryKey: ['assignment-unassigned-counts'] }),
        queryClient.invalidateQueries({ queryKey: ['assignment-members'] }),
        queryClient.invalidateQueries({ queryKey: ['coach-members'] }),
        queryClient.invalidateQueries({ queryKey: ['members'] }),
        queryClient.invalidateQueries({ queryKey: ['rh-coach-member-count'] }),
        queryClient.invalidateQueries({ queryKey: ['coach-salary-history'] }),
      ])
    },
    onError: (error: Error) => {
      toast({ title: t('coachAssignment.toast.error'), description: error.message, variant: 'destructive' })
    },
  })

  if (!isAdmin) {
    return (
      <>
        <PageHeader title={t('coachAssignment.title')} />
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('coachAssignment.forbidden')}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('coachAssignment.title')}
        description={t('coachAssignment.description')}
        actions={
          <Badge variant="outline" className="tabular-nums">
            {t('coachAssignment.unassignedTotal').replace('{count}', String(unassignedTotal))}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Colonne principale : filtres + liste */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('coachAssignment.status.active')}</SelectItem>
                <SelectItem value="inactive">{t('coachAssignment.status.inactive')}</SelectItem>
                <SelectItem value="all">{t('coachAssignment.status.all')}</SelectItem>
              </SelectContent>
            </Select>

            <CategoryFilter
              selected={filters.categories}
              counts={categoryCounts}
              onToggle={toggleCategory}
              onReset={() => {
                setFilters((prev) => ({ ...prev, categories: [] }))
                setSelectedIds(new Set())
              }}
            />
          </div>

          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <span className="text-sm font-medium">
                {t('coachAssignment.members.selected').replace('{count}', String(selectedIds.size))}
              </span>
              <span className="text-sm text-muted-foreground">
                {t('coachAssignment.action.target')}{' '}
                <Badge variant="secondary" className="ml-1">
                  {isUnassignTarget
                    ? t('coachAssignment.coaches.unassigned')
                    : targetCoach
                      ? `${toUpper(targetCoach.first_name)} ${toUpper(targetCoach.last_name)}`
                      : 'Ã¢â‚¬â€'}
                </Badge>
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                  {t('coachAssignment.action.clear')}
                </Button>
                <Button
                  size="sm"
                  disabled={!canAct || assignMutation.isPending}
                  onClick={() => setDialogOpen(true)}
                >
                  {isUnassignTarget ? (
                    <UserX className="mr-2 h-4 w-4" aria-hidden />
                  ) : (
                    <UserCheck className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {isUnassignTarget
                    ? t('coachAssignment.action.unassign')
                    : t('coachAssignment.action.assign')}
                </Button>
              </div>
            </div>
          ) : null}

          {!canAct ? (
            <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              {t('coachAssignment.action.pickCoachFirst')}
            </p>
          ) : null}

          <div className={isLoadingMembers ? 'opacity-60 transition-opacity' : undefined}>
            <MemberTable
              members={members}
              total={totalMembers}
              totalPages={totalPages}
              page={page}
              onPageChange={setPage}
              selectedIds={selectedIds}
              onToggle={toggleId}
              onTogglePage={togglePage}
              search={filters.search}
              onSearchChange={(value) => setFilters((prev) => ({ ...prev, search: value }))}
              coachFilter={filters.coachId}
              showCoachColumn={filters.coachId === 'all'}
              readOnly={!isAdmin}
            />
          </div>
        </div>

        {/* Colonne latÃƒÂ©rale : destinations */}
        <aside className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t('coachAssignment.coaches.title')}
          </h2>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <CoachPanel
              coaches={coaches}
              unassignedCounts={unassignedCounts}
              unassignedTotal={unassignedTotal}
              selectedCoachId={filters.coachId as CoachFilter}
              onSelect={(coachId) => {
                setFilters((prev) => ({ ...prev, coachId }))
                setSelectedIds(new Set())
              }}
              isLoading={false}
            />
          )}
        </aside>
      </div>

      <AssignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedCount={selectedIds.size}
        target={filters.coachId}
        targetCoach={targetCoach}
        isPending={assignMutation.isPending}
        onConfirm={(reason) =>
          assignMutation.mutate({
            memberIds: Array.from(selectedIds),
            coachId: isUnassignTarget ? null : filters.coachId,
            reason,
          })
        }
      />
    </>
  )
}
