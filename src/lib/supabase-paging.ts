/**
 * Lecture paginée des tables Supabase.
 *
 * Pourquoi : PostgREST applique un plafond global de lignes par requête
 * (`max_rows`, 1000 sur ce projet en production). Au-delà, la réponse est
 * **silencieusement tronquée** — les agrégations financières sous-estiment
 * alors le CA et le LTV sans lever la moindre erreur.
 *
 * La stratégie ne se fie donc jamais à « la page est plus courte que
 * demandée » (ce qui confond fin de données et plafond serveur) : on lit le
 * total via `Prefer: count=exact`, puis on parcours les tranches restantes.
 * La première tranche est séquentielle (elle fournit le total), les suivantes
 * sont parallèles afin de ne pas multiplier la latence.
 *
 * Le plan d'exécution PostgreSQL reste sur les index existants : le `.range()`
 * ne change ni le `WHERE` ni l'index employé, il ajoute seulement un `LIMIT` /
 * `OFFSET` — le coût par page est donc celui de la requête déjà indexée.
 */

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}

/**
 * (from, to) → bornes inclusives, comme `.range()` de PostgREST.
 *
 * `PromiseLike` et non `Promise` : le builder supabase-js n'implémente ni
 * `catch` ni `finally`, on ne peut donc pas le passer tel quel en `Promise`.
 */
export type PageFetcher<T> = (from: number, to: number) => PromiseLike<PageResult<T>>

export interface FetchAllOptions {
  /** Taille d'une tranche. 1000 = plafond prod, reste sûre si lowered. */
  pageSize?: number
  /** Garde-fou : nombre max de lignes assemblées avant abandon. */
  maxRows?: number
  /** Nombre de tranches en parallèle (hors première). */
  concurrency?: number
}

export const DEFAULT_PAGE_SIZE = 1000
export const DEFAULT_MAX_ROWS = 100_000
export const DEFAULT_CONCURRENCY = 6

export class PagingError extends Error {}

/** Exécute `tasks` avec au plus `limit` en vol. */
export async function runPooled<T>(
  tasks: Array<() => PromiseLike<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, tasks.length)) },
    async () => {
      while (cursor < tasks.length) {
        const index = cursor++
        results[index] = await tasks[index]()
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * Assemble toutes les lignes d'une table, par-delà le plafond `max_rows`.
 *
 * @throws PagingError si une tranche échoue — on préfère une erreur visible à
 *         des chiffres faux.
 */
export async function fetchAllPages<T>(
  fetchPage: PageFetcher<T>,
  options: FetchAllOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY

  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new PagingError(`pageSize invalide : ${pageSize}`)
  }

  const first = await fetchPage(0, pageSize - 1)
  if (first.error) {
    throw new PagingError(first.error.message)
  }

  const rows: T[] = first.data ? [...first.data] : []
  const total = typeof first.count === "number" ? first.count : null

  // Sans total connu, on ne peut pas distinguer « fin des données » d'un
  // plafond serveur plus bas que pageSize : on s'arrête plutôt que de boucler.
  if (total === null || rows.length >= total || rows.length === 0) {
    return rows
  }

  const totalPages = Math.ceil(total / pageSize)
  const rest = Array.from({ length: totalPages - 1 }, (_, i) => {
    const from = (i + 1) * pageSize
    return () => fetchPage(from, from + pageSize - 1)
  })

  const pages = await runPooled(rest, concurrency)
  for (const page of pages) {
    if (page.error) {
      throw new PagingError(page.error.message)
    }
    if (page.data?.length) rows.push(...page.data)
  }

  return rows.length > maxRows ? rows.slice(0, maxRows) : rows
}

/** `count: 'exact'` pour lire le total sans surcoût de requête séparée. */
export const EXACT_COUNT = { count: "exact" } as const
