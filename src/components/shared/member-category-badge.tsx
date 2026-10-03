import { Badge } from '@/components/ui/badge'
import { useT } from '@/i18n'
import { CATEGORY_LABEL_KEYS, asMemberCategory, type MemberCategory } from '@/lib/member-category'
import { cn } from '@/lib/utils'

/**
 * Palette des catégories. Volontairement pastel en clair et saturé en sombre :
 * les 5 nuances doivent rester distinguables côte à côte dans un tableau dense
 * comme dans les compteurs d'un coach.
 */
const CATEGORY_STYLES: Record<MemberCategory, string> = {
  adult_male: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300',
  adult_female: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300',
  boy: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300',
  girl: 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-300',
  unknown: 'bg-muted text-muted-foreground',
}

interface MemberCategoryBadgeProps {
  category: unknown
  /** Ajoute le détail `16 ans` à côté du libellé quand l'âge est connu. */
  age?: number | null
  className?: string
}

/**
 * Badge de catégorie réutilisé par `/coach-assignment`, `/rh` et `/members`.
 * La catégorie arrive de la SQL ou du calcul local : `asMemberCategory` garantit
 * qu'une valeur inattendue n'affiche jamais un libellé arbitraire.
 */
export function MemberCategoryBadge({ category, age, className }: MemberCategoryBadgeProps) {
  const t = useT()
  const cat = asMemberCategory(category)
  const showAge = typeof age === 'number' && Number.isFinite(age) && cat !== 'unknown'

  return (
    <Badge className={cn('font-semibold', CATEGORY_STYLES[cat], className)}>
      {t(CATEGORY_LABEL_KEYS[cat])}
      {showAge ? ` · ${age} ${t('coachAssignment.yearsShort')}` : ''}
    </Badge>
  )
}