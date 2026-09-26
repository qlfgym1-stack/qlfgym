import { describe, it, expect, vi } from "vitest"
import {
  fetchAllPages,
  runPooled,
  PagingError,
  DEFAULT_PAGE_SIZE,
} from "./supabase-paging"

/** Fabrique un fetcher paginé sur un tableau, avec `count` exact. */
function makeFetcher<T>(rows: T[], pageSize: number, failOn?: number) {
  const calls: Array<[number, number]> = []
  const fetcher = async (from: number, to: number) => {
    calls.push([from, to])
    if (failOn !== undefined && calls.length === failOn) {
      return { data: null, error: { message: "boom" } }
    }
    return { data: rows.slice(from, to + 1), error: null, count: rows.length }
  }
  return { fetcher, calls }
}

describe("fetchAllPages", () => {
  it("retourne tout quand tout tient dans une page", async () => {
    const { fetcher, calls } = makeFetcher([1, 2, 3], 1000)
    await expect(fetchAllPages(fetcher, { pageSize: 1000 })).resolves.toEqual([1, 2, 3])
    expect(calls).toEqual([[0, 999]])
  })

  it("découpe en pages au-delà du plafond et réassemble dans l'ordre", async () => {
    const rows = Array.from({ length: 1536 }, (_, i) => i)
    const { fetcher, calls } = makeFetcher(rows, 1000)
    const result = await fetchAllPages(fetcher, { pageSize: 1000 })
    expect(result).toHaveLength(1536)
    expect(result).toEqual(rows)
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it("franchit le plafond de 1000 lignes (cas payments prod = 1536)", async () => {
    const rows = Array.from({ length: 1536 }, (_, i) => ({ id: i }))
    const { fetcher } = makeFetcher(rows, 1000)
    const result = await fetchAllPages(fetcher, { pageSize: DEFAULT_PAGE_SIZE })
    // Sans pagination, PostgREST aurait renvoyé 1000 lignes et perdu 536 paiements.
    expect(result).toHaveLength(1536)
  })

  it("gère un multiple exact de la taille de page", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => i)
    const { fetcher, calls } = makeFetcher(rows, 1000)
    await expect(fetchAllPages(fetcher, { pageSize: 1000 })).resolves.toHaveLength(2000)
    expect(calls).toHaveLength(2)
  })

  it("ne fait pas de requête inutile quand la première page est vide", async () => {
    const { fetcher, calls } = makeFetcher([], 1000)
    await expect(fetchAllPages(fetcher, { pageSize: 1000 })).resolves.toEqual([])
    expect(calls).toEqual([[0, 999]])
  })

  it("propage l'erreur de la première page", async () => {
    const { fetcher } = makeFetcher([1, 2, 3], 1000, 1)
    await expect(fetchAllPages(fetcher, { pageSize: 1000 })).rejects.toThrow(PagingError)
  })

  it("propage l'erreur d'une page ultérieure", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i)
    const { fetcher } = makeFetcher(rows, 1000, 2)
    await expect(fetchAllPages(fetcher, { pageSize: 1000 })).rejects.toThrow("boom")
  })

  it("préfère échouer plutôt que de renvoyer des chiffres tronqués", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i)
    const { fetcher } = makeFetcher(rows, 1000, 2)
    await expect(fetchAllPages(fetcher, { pageSize: 1000 })).rejects.toBeInstanceOf(PagingError)
  })

  it("s'arrête si le total est inconnu (pas de boucle infinie)", async () => {
    const calls: number[] = []
    const fetcher = async () => {
      calls.push(1)
      return { data: [1, 2, 3], error: null, count: null }
    }
    await expect(fetchAllPages(fetcher, { pageSize: 1000 })).resolves.toEqual([1, 2, 3])
    expect(calls).toHaveLength(1)
  })

  it("respecte maxRows", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => i)
    const { fetcher } = makeFetcher(rows, 1000)
    const result = await fetchAllPages(fetcher, { pageSize: 1000, maxRows: 2500 })
    expect(result).toHaveLength(2500)
  })

  it("rejette une pageSize invalide", async () => {
    const fetcher = async () => ({ data: [], error: null, count: 0 })
    await expect(fetchAllPages(fetcher, { pageSize: 0 })).rejects.toThrow(PagingError)
    await expect(fetchAllPages(fetcher, { pageSize: -5 })).rejects.toThrow(PagingError)
  })

  it("respecte la concurrence sur les pages suivantes", async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => i)
    let inFlight = 0
    let peak = 0
    const fetcher = async (from: number, to: number) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return { data: rows.slice(from, to + 1), error: null, count: rows.length }
    }
    const result = await fetchAllPages(fetcher, { pageSize: 1000, concurrency: 3 })
    expect(result).toHaveLength(10_000)
    expect(peak).toBeLessThanOrEqual(3)
  })
})

describe("runPooled", () => {
  it("préserve l'ordre des résultats", async () => {
    const tasks = [30, 10, 20].map((ms, i) => async () => {
      await new Promise((r) => setTimeout(r, ms))
      return i
    })
    await expect(runPooled(tasks, 2)).resolves.toEqual([0, 1, 2])
  })

  it("supporte une liste vide", async () => {
    await expect(runPooled([], 4)).resolves.toEqual([])
  })

  it("ne dépasse jamais la limite demandée", async () => {
    const spy = vi.fn(async () => 1)
    await runPooled(Array.from({ length: 10 }, () => spy), 2)
    expect(spy).toHaveBeenCalledTimes(10)
  })
})
