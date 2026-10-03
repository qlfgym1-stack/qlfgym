import { GraduationCap, Loader2, UserX, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useT } from '@/i18n'
import {
  MEMBER_CATEGORIES,
  CATEGORY_LABEL_KEYS,
  asMemberCategory,
  type MemberCategory,
} from '@/lib/member-category'
import { computeCoachSalary, countsFromListCoaches, ratesFromJson } from '@/lib/coach-salary'
import { formatCurrency, toUpper, cn } from '@/lib/utils'
import type { AssignmentCoach, CoachFilter } from '../hooks/useCoachAssignmentData'

interface CoachPanelProps {
  coaches: AssignmentCoach[]
  unassignedCounts: Record<MemberCategory, number>
  unassignedTotal: number
  selectedCoachId: CoachFilter
  onSelect: (coachId: CoachFilter) => void
  isLoading: boolean
}

/**
 * Compteurs par catégorie. Seules les catégories à effectif non nul sont
 * affichées : sur un coach typique, 1 à 2 catégories sont concernées, donc les
 5 compteurs ne saturent pas la largeur. Aucun libellé n'est tronqué — une
 * traduction coupée est illisible, notamment en arabe.
 */
function CategoryCounts({ counts }: { counts: Record<MemberCategory, number> }) {
  const t = useT()
  const present = MEMBER_CATEGORIES.filter((c) => counts[c] > 0)

  if (present.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('coachAssignment.categories.empty')}</p>
  }

  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label={t('coachAssignment.categories.byCategory')}
    >
      {present.map((category) => (
        <Badge key={category} variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
          <span className="truncate">{t(CATEGORY_LABEL_KEYS[asMemberCategory(category)])}</span>
          <span className="ml-1 tabular-nums">{counts[category]}</span>
        </Badge>
      ))}
    </div>
  )
}

export function CoachPanel({
  coaches,
  unassignedCounts,
  unassignedTotal,
  selectedCoachId,
  onSelect,
  isLoading,
}: CoachPanelProps) {
  const t = useT()

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-19rem)] pr-2">
      <div className="flex flex-col gap-2">
        {/* Rebut « non affectés » : c'est une destination d'affectation à part
            entière, pas une simple ligne informative. */}
        <button
          type="button"
          onClick={() => onSelect('unassigned')}
          aria-pressed={selectedCoachId === 'unassigned'}
          className={cn(
            'rounded-lg border p-3 text-left transition-colors',
            selectedCoachId === 'unassigned'
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-border hover:bg-accent/50'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-semibold">{t('coachAssignment.coaches.unassigned')}</span>
            </div>
            <Badge variant="secondary" className="tabular-nums">
              {unassignedTotal}
            </Badge>
          </div>
          <div className="mt-2">
            <CategoryCounts counts={unassignedCounts} />
          </div>
        </button>

        {coaches.map((coach) => {
          const salary = computeCoachSalary({
            fixedSalary: coach.salary,
            bonus: coach.bonus,
            baseRate: coach.rate_per_member,
            categoryRates: ratesFromJson(coach.rates, coach.rate_per_member),
            counts: countsFromListCoaches(coach),
          })
          const active = selectedCoachId === coach.id

          return (
            <button
              key={coach.id}
              type="button"
              onClick={() => onSelect(coach.id)}
              aria-pressed={active}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-accent/50'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <GraduationCap className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {toUpper(coach.first_name)} {toUpper(coach.last_name)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{coach.email ?? '—'}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  <Users className="mr-1 h-3 w-3" aria-hidden />
                  {salary.activeTotal}
                </Badge>
              </div>

              <div className="mt-2">
                <CategoryCounts counts={countsFromListCoaches(coach)} />
              </div>

              <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
                <span className="text-muted-foreground">{t('coachAssignment.coaches.variable')}</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(salary.variableAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('coachAssignment.coaches.total')}</span>
                <span className="font-semibold tabular-nums text-primary">
                  {formatCurrency(salary.totalAmount)}
                </span>
              </div>
            </button>
          )
        })}

        {coaches.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t('coachAssignment.coaches.none')}
          </p>
        ) : null}
      </div>
    </ScrollArea>
  )
}