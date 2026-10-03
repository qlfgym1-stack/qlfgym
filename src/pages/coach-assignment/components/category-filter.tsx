import { Check } from 'lucide-react'
import { useT } from '@/i18n'
import {
  CATEGORY_LABEL_KEYS,
  MEMBER_CATEGORIES,
  asMemberCategory,
  type MemberCategory,
} from '@/lib/member-category'
import { cn } from '@/lib/utils'

interface CategoryFilterProps {
  selected: MemberCategory[]
  /** Effectifs affichés à côté de chaque catégorie (non affectés ou coach choisi). */
  counts: Record<MemberCategory, number>
  onToggle: (category: MemberCategory) => void
  onReset: () => void
}

/**
 * Pastilles de filtrage par catégorie. Cliquer sur plusieurs catégories
 * empilera les filtres (un homme ET un garçon), et non : c'est le comportement
 * attendu d'un filtre de liste et il n'y a pas de piège d'exclusion.
 */
export function CategoryFilter({ selected, counts, onToggle, onReset }: CategoryFilterProps) {
  const t = useT()
  const hasSelection = selected.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onReset}
        className={cn(
          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
          !hasSelection
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border hover:bg-accent'
        )}
      >
        {t('coachAssignment.filters.allCategories')}
      </button>

      {MEMBER_CATEGORIES.map((category) => {
        const active = selected.includes(category)
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {active ? <Check className="h-3 w-3" aria-hidden /> : null}
            <span>{t(CATEGORY_LABEL_KEYS[asMemberCategory(category)])}</span>
            <span className={cn('tabular-nums', active ? 'text-primary' : 'text-muted-foreground')}>
              {counts[category] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}