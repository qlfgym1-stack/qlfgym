/**
 * Catégorie d'un adhérent — miroir TypeScript de la fonction SQL
 * `public.member_category(gender, birth_date)` (migration 00137).
 *
 * Pourquoi une catégorie DÉRIVÉE et non stockée : un « enfant garçon » de 15 ans
 * devient un « homme » l'année suivante. Une colonne figerait la catégorie et
 * créerait des incohérences avec la paie. Ici, la catégorie est toujours
 * recalculée depuis la date de naissance.
 *
 * ⚠️ Toute modification doit être répercutée dans la fonction SQL, sinon le
 * module et la base divergent. Le seuil d'âge est unique (CHILD_MAX_AGE).
 */

/** En dessous de cet âge, l'adhérent est classé « enfant ». 16 ans pile = adulte. */
export const CHILD_MAX_AGE = 15

export const MEMBER_CATEGORIES = [
  'adult_male',
  'adult_female',
  'boy',
  'girl',
  'unknown',
] as const

export type MemberCategory = (typeof MEMBER_CATEGORIES)[number]

/** Catégories qui portent un taux de paie propre. `unknown` suit le taux de base. */
export const PRICED_CATEGORIES = ['adult_male', 'adult_female', 'boy', 'girl'] as const
export type PricedCategory = (typeof PRICED_CATEGORIES)[number]

/** Clés i18n des libellés — l'ordre suit `MEMBER_CATEGORIES`. */
export const CATEGORY_LABEL_KEYS: Record<MemberCategory, string> = {
  adult_male: 'coachAssignment.category.adultMale',
  adult_female: 'coachAssignment.category.adultFemale',
  boy: 'coachAssignment.category.boy',
  girl: 'coachAssignment.category.girl',
  unknown: 'coachAssignment.category.unknown',
}

/** Reconnus par la SQL : `member_category` normalise en minuscules. */
const MALE_TOKENS = new Set(['male', 'm', 'homme', 'masculin', 'boy', 'garcon', 'garçon'])
const FEMALE_TOKENS = new Set([
  'female',
  'f',
  'femme',
  'feminin',
  'féminin',
  'girl',
  'fille',
])

/** Au-delà, la date est un artefact d'import (21 centenaires en base au 03/10/2026). */
export const MAX_PLAUSIBLE_AGE = 120

export interface PlainDate {
  y: number
  m: number
  d: number
}

/**
 * Découpe une date `YYYY-MM-DD` en composants **locaux**.
 *
 * `new Date('1990-05-15')` est interprété en UTC : en décalage horaire négatif
 * il affiche le 14 mai et l'âge peut sauter d'un an. On découpe donc à la main.
 */
export function parsePlainDate(value: string | null | undefined): PlainDate | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!m) return null
  const y = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { y, m: month, d: day }
}

/**
 * Âge en années **pleines**.
 *
 * Renvoie `null` si la date est absente, future, illisible ou aberrante — c'est
 * exactement la convention de `public.member_age`, donc « âge inconnu » et pas
 * « 0 an ».
 */
export function memberAge(
  birthDate: string | null | undefined,
  today: Date = new Date()
): number | null {
  const birth = parsePlainDate(birthDate)
  if (!birth) return null

  const now: PlainDate = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() }

  // Date future : saisie erronée.
  if (birth.y > now.y || (birth.y === now.y && (birth.m > now.m || (birth.m === now.m && birth.d > now.d)))) {
    return null
  }

  let age = now.y - birth.y
  // L'anniversaire n'est pas encore passé cette année.
  if (now.m < birth.m || (now.m === birth.m && now.d < birth.d)) age--

  if (age > MAX_PLAUSIBLE_AGE) return null
  return age
}

/** Catégorie dérivée. `today` est injectable pour rendre les tests déterministes. */
export function memberCategory(
  gender: string | null | undefined,
  birthDate: string | null | undefined,
  today: Date = new Date()
): MemberCategory {
  const age = memberAge(birthDate, today)
  if (age === null) return 'unknown'

  const g = (gender ?? '').trim().toLowerCase()
  if (MALE_TOKENS.has(g)) return age <= CHILD_MAX_AGE ? 'boy' : 'adult_male'
  if (FEMALE_TOKENS.has(g)) return age <= CHILD_MAX_AGE ? 'girl' : 'adult_female'
  return 'unknown'
}

export function isChildCategory(category: MemberCategory): boolean {
  return category === 'boy' || category === 'girl'
}

export function emptyCategoryCounts(): Record<MemberCategory, number> {
  return { adult_male: 0, adult_female: 0, boy: 0, girl: 0, unknown: 0 }
}

/** Compte les catégories d'une liste. `get` isole l'extraction pour rester générique. */
export function countByCategory<T>(
  items: readonly T[],
  get: (item: T) => MemberCategory
): Record<MemberCategory, number> {
  const counts = emptyCategoryCounts()
  for (const item of items) counts[get(item)]++
  return counts
}

/** Normalise une valeur venue de la base : la SQL ne renvoie jamais autre chose. */
export function asMemberCategory(value: unknown): MemberCategory {
  return typeof value === 'string' && (MEMBER_CATEGORIES as readonly string[]).includes(value)
    ? (value as MemberCategory)
    : 'unknown'
}