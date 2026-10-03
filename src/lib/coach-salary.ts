/**
 * Paie d'un coach — source de vérité unique.
 *
 * ⚠️ AVANT CE FICHIER, `/rh` (rh.tsx) et `/coach-mode` (coach-mode.tsx)
 * implémentaient chacun leur propre formule, et `/rh` recalculait le total
 * dans la mutation de clôture alors que `/coach-mode` recalculait à l'affichage.
 * Deux chiffres possibles pour la même paie. Ce module supprime la divergence :
 * les deux pages consomment désormais exactement la même fonction.
 *
 * Modèle de calcul :
 *   effectif actif par catégorie × taux de la catégorie = montant variable
 *   + salaire fixe + bonus exceptionnel
 *
 * Un taux de catégorie est une SURCHARGE. S'il n'est pas saisi (ou nul/négatif),
 * on retombe sur le taux de base du coach — c'est ce qui rend la migration sans
 * impact : tant que rien n'est saisi, le résultat est bit-à-bit identique à
 * l'ancien `rate_per_member × effectif actif`.
 *
 * La catégorie `unknown` (date de naissance inexploitable) n'a pas de taux propre
 * et suit toujours le taux de base.
 */

import {
  MEMBER_CATEGORIES,
  PRICED_CATEGORIES,
  emptyCategoryCounts,
  type MemberCategory,
  type PricedCategory,
} from './member-category'

export interface CoachSalaryInput {
  /** Salaire fixe mensuel. */
  fixedSalary: number | null | undefined
  /** Bonus exceptionnel. */
  bonus: number | null | undefined
  /** Taux de base historique (`staff.rate_per_member`) — valeur de repli. */
  baseRate: number | null | undefined
  /** Surcharges par catégorie. Absent ou incomplet = repli sur le taux de base. */
  categoryRates?: Partial<Record<PricedCategory, number>> | null
  /** Effectif ACTIF par catégorie. Les membres inactifs ne comptent pas. */
  counts?: Partial<Record<MemberCategory, number>> | null
}

export interface CoachCategoryLine {
  category: MemberCategory
  count: number
  rate: number
  amount: number
  /** true = un taux propre a été saisi pour cette catégorie. */
  isOverride: boolean
}

export interface CoachSalaryResult {
  lines: CoachCategoryLine[]
  /** Effectif actif total (toutes catégories confondues). */
  activeTotal: number
  /** Effectif couvert par au moins un taux propre (donc hors `unknown`). */
  pricedTotal: number
  fixedAmount: number
  variableAmount: number
  bonusAmount: number
  totalAmount: number
}

/** Montants en dinars : on arrondit au centime pour éviter les flottants 0.1+0.2. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function toNum(value: number | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Un taux valide est fini et positif ou nul ; `NaN` / négatif = non saisi.
 * `null` / `undefined` / chaîne vide valent « absent » — `Number(null)` vaut 0,
 * ce qui transformerait un taux non saisi en surcharge à zéro.
 */
function resolveOverride(rate: unknown): number | null {
  if (rate === null || rate === undefined || rate === '') return null
  const n = Number(rate)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * Calcule la paie mensuelle d'un coach à partir de son effectif par catégorie.
 *
 * Le résultat contient une ligne par catégorie (`MEMBER_CATEGORIES`), y compris
 * les catégories à effectif nul : l'interface peut ainsi afficher une ligne vide
 * plutôt qu'un trou, et les tests ont toujours 5 lignes à vérifier.
 */
export function computeCoachSalary(input: CoachSalaryInput): CoachSalaryResult {
  const fixedAmount = round2(toNum(input.fixedSalary))
  const bonusAmount = round2(toNum(input.bonus))
  const baseRate = round2(toNum(input.baseRate))

  const counts = { ...emptyCategoryCounts(), ...(input.counts ?? {}) }

  const lines: CoachCategoryLine[] = MEMBER_CATEGORIES.map((category) => {
    const count = Math.max(0, Math.trunc(toNum(counts[category])))
    const override =
      category === 'unknown'
        ? null
        : resolveOverride((input.categoryRates as Record<string, unknown> | null | undefined)?.[category])
    const rate = override ?? baseRate
    return {
      category,
      count,
      rate,
      amount: round2(count * rate),
      isOverride: override !== null,
    }
  })

  const variableAmount = round2(lines.reduce((sum, line) => sum + line.amount, 0))
  const activeTotal = lines.reduce((sum, line) => sum + line.count, 0)
  const pricedTotal = lines
    .filter((line) => line.category !== 'unknown')
    .reduce((sum, line) => sum + line.count, 0)

  return {
    lines,
    activeTotal,
    pricedTotal,
    fixedAmount,
    variableAmount,
    bonusAmount,
    totalAmount: round2(fixedAmount + variableAmount + bonusAmount),
  }
}

/**
 * Formule historique, uniquement pour comparer un snapshot figé.
 *
 * `coach_salary_history` ne stocke qu'un `member_count` global : impossible de
 * retrouver le détail par catégorie. On s'en sert pour détecter un snapshot
 * enregistré avec l'ancienne formule avant que les taux par catégorie n'existent.
 */
export function legacyCoachSalary(
  fixedSalary: number | null | undefined,
  ratePerMember: number | null | undefined,
  memberCount: number | null | undefined
): number {
  return round2(toNum(fixedSalary) + Math.max(0, Math.trunc(toNum(memberCount))) * toNum(ratePerMember))
}

/** Effectifs par catégorie à partir des compteurs renvoyés par `list_coaches`. */
export function countsFromListCoaches(coach: {
  adult_male_count?: number | null
  adult_female_count?: number | null
  boy_count?: number | null
  girl_count?: number | null
  unknown_count?: number | null
}): Record<MemberCategory, number> {
  return {
    adult_male: toNum(coach.adult_male_count),
    adult_female: toNum(coach.adult_female_count),
    boy: toNum(coach.boy_count),
    girl: toNum(coach.girl_count),
    unknown: toNum(coach.unknown_count),
  }
}

/** Surcharges issues du jsonb `rates` renvoyé par `list_coaches`. */
export function ratesFromJson(
  rates: unknown,
  baseRate: number | null | undefined
): Partial<Record<PricedCategory, number>> {
  const out: Partial<Record<PricedCategory, number>> = {}
  if (!rates || typeof rates !== 'object') return out
  const src = rates as Record<string, unknown>
  for (const category of PRICED_CATEGORIES) {
    const resolved = resolveOverride(src[category])
    // La SQL renvoie déjà le repli : on ne garde que ce qui diffère du taux de
    // base, sinon `isOverride` serait toujours vrai et l'UI mentirait.
    if (resolved !== null && resolved !== round2(toNum(baseRate))) out[category] = resolved
  }
  return out
}