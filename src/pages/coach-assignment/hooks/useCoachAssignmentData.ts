import { useMemo } from 'react'
import { useQuery } from '@/hooks/useQuery'
import { useSupabase } from '@/hooks/useSupabase'
import {
  MEMBER_CATEGORIES,
  asMemberCategory,
  emptyCategoryCounts,
  type MemberCategory,
  type PricedCategory,
} from '@/lib/member-category'
import { EXACT_COUNT } from '@/lib/supabase-paging'

export const ASSIGNMENT_PAGE_SIZE = 50

export interface AssignmentMember {
  id: string
  first_name: string
  last_name: string
  full_name: string | null
  phone: string | null
  photo_url: string | null
  status: string
  gender: string | null
  birth_date: string | null
  age: number | null
  category: MemberCategory
  coach_id: string | null
  coach_first_name: string | null
  coach_last_name: string | null
}

/** Ligne renvoyée par `list_coaches` — les compteurs portent sur l'effectif ACTIF. */
export interface AssignmentCoach {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  salary: number
  rate_per_member: number
  bonus: number
  adult_male_count: number
  adult_female_count: number
  boy_count: number
  girl_count: number
  unknown_count: number
  active_total: number
  total_count: number
  /** jsonb : les 4 catégories tarifées, déjà résolues avec repli par la SQL. */
  rates: Partial<Record<PricedCategory, number>>
}

export type CoachFilter = 'all' | 'unassigned' | string

export interface AssignmentFilters {
  /** Vide = toutes les catégories. */
  categories: MemberCategory[]
  coachId: CoachFilter
  /** 'all' | 'active' | 'inactive' | ... */
  status: string
  search: string
}

export const DEFAULT_ASSIGNMENT_FILTERS: AssignmentFilters = {
  categories: [],
  coachId: 'unassigned',
  status: 'active',
  search: '',
}

/**
 * Neutralise les caractères qui cassent la syntaxe d'un filtre PostgREST.
 * `.or('a.ilike.%x%,b.ilike.%x%')` : une virgule, une parenthèse ou un `%`
 * saisi par l'utilisateur ferait échouer toute la requête. On retire les
 * séparateurs et on convertit les espaces en joker.
 */
export function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()%*\\]/g, ' ')
    .trim()
    .replace(/\s+/g, '%')
}

export function useCoachAssignmentData(
  orgId: string | undefined,
  filters: AssignmentFilters,
  page: number
) {
  const supabase = useSupabase()
  const search = sanitizeSearch(filters.search)

  const coachesQuery = useQuery({
    queryKey: ['assignment-coaches', orgId],
    queryFn: async (): Promise<AssignmentCoach[]> => {
      if (!orgId) return []
      const { data, error } = await (supabase.rpc as any)('list_coaches', { p_org_id: orgId })
      if (error) throw new Error(error.message)
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        salary: Number(row.salary ?? 0),
        rate_per_member: Number(row.rate_per_member ?? 0),
        bonus: Number(row.bonus ?? 0),
        adult_male_count: Number(row.adult_male_count ?? 0),
        adult_female_count: Number(row.adult_female_count ?? 0),
        boy_count: Number(row.boy_count ?? 0),
        girl_count: Number(row.girl_count ?? 0),
        unknown_count: Number(row.unknown_count ?? 0),
        active_total: Number(row.active_total ?? 0),
        total_count: Number(row.total_count ?? 0),
        rates: (row.rates ?? {}) as Partial<Record<PricedCategory, number>>,
      }))
    },
    enabled: !!orgId,
  })

  const unassignedQuery = useQuery({
    queryKey: ['assignment-unassigned-counts', orgId],
    queryFn: async (): Promise<Record<MemberCategory, number>> => {
      const counts = emptyCategoryCounts()
      if (!orgId) return counts
      const { data, error } = await (supabase.rpc as any)('count_unassigned_by_category', {
        p_org_id: orgId,
      })
      if (error) throw new Error(error.message)
      for (const row of (data ?? []) as Array<{ category: string; member_count: number }>) {
        counts[asMemberCategory(row.category)] = Number(row.member_count ?? 0)
      }
      return counts
    },
    enabled: !!orgId,
  })

  const membersQuery = useQuery({
    queryKey: [
      'assignment-members',
      orgId,
      filters.categories.join(','),
      filters.coachId,
      filters.status,
      search,
      page,
    ],
    queryFn: async (): Promise<{ rows: AssignmentMember[]; total: number }> => {
      if (!orgId) return { rows: [], total: 0 }

      let q = supabase
        .from('member_assignment_view' as any)
        .select(
          'id, first_name, last_name, full_name, phone, photo_url, status, gender, birth_date, age, category, coach_id, coach_first_name, coach_last_name',
          EXACT_COUNT
        )
        .eq('organization_id', orgId)

      if (filters.categories.length > 0) {
        q = q.in('category', filters.categories)
      }
      if (filters.coachId === 'unassigned') {
        q = q.is('coach_id', null)
      } else if (filters.coachId !== 'all') {
        q = q.eq('coach_id', filters.coachId)
      }
      if (filters.status !== 'all') {
        q = q.eq('status', filters.status)
      }
      if (search) {
        q = q.or(`full_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
      }

      const from = page * ASSIGNMENT_PAGE_SIZE
      const { data, count, error } = await q
        .order('full_name', { ascending: true })
        .range(from, from + ASSIGNMENT_PAGE_SIZE - 1)

      if (error) throw new Error(error.message)

      return {
        // La vue `member_assignment_view` n'existe pas encore dans les types Supabase
        // écrits à la main (`src/types/supabase.ts`) : le client typé ne peut donc
        // pas inférer la ligne. On repasse par `unknown` avant de la mapper.
        rows: ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
          id: row.id as string,
          first_name: (row.first_name as string) ?? '',
          last_name: (row.last_name as string) ?? '',
          full_name: (row.full_name as string | null) ?? null,
          phone: (row.phone as string | null) ?? null,
          photo_url: (row.photo_url as string | null) ?? null,
          status: (row.status as string) ?? 'active',
          gender: (row.gender as string | null) ?? null,
          birth_date: (row.birth_date as string | null) ?? null,
          age: row.age === null || row.age === undefined ? null : Number(row.age),
          category: asMemberCategory(row.category),
          coach_id: (row.coach_id as string | null) ?? null,
          coach_first_name: (row.coach_first_name as string | null) ?? null,
          coach_last_name: (row.coach_last_name as string | null) ?? null,
        })),
        total: Number(count ?? 0),
      }
    },
    enabled: !!orgId,
  })

  const coaches = coachesQuery.data ?? []
  const unassignedCounts = unassignedQuery.data ?? emptyCategoryCounts()
  const rows = membersQuery.data?.rows ?? []
  const total = membersQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ASSIGNMENT_PAGE_SIZE))

  /** Effectif d'un coach dans une catégorie donnée (0 si le coach n'existe pas). */
  const countFor = useMemo(() => {
    return (coachId: string, category: MemberCategory): number => {
      const coach = coaches.find((c: AssignmentCoach) => c.id === coachId)
      if (!coach) return 0
      switch (category) {
        case 'adult_male':
          return coach.adult_male_count
        case 'adult_female':
          return coach.adult_female_count
        case 'boy':
          return coach.boy_count
        case 'girl':
          return coach.girl_count
        default:
          return coach.unknown_count
      }
    }
  }, [coaches])

  return {
    coaches,
    unassignedCounts,
    unassignedTotal: useMemo(
      () => MEMBER_CATEGORIES.reduce((sum, c) => sum + unassignedCounts[c], 0),
      [unassignedCounts]
    ),
    countFor,
    members: rows,
    totalMembers: total,
    totalPages,
    isLoading: coachesQuery.isLoading || membersQuery.isLoading,
    isLoadingCoaches: coachesQuery.isLoading,
    isLoadingMembers: membersQuery.isLoading,
  }
}

export type UseCoachAssignmentData = ReturnType<typeof useCoachAssignmentData>