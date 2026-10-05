import { describe, it, expect } from "vitest"
import { algiersDay, countSessionsDone, MAX_CHECKINS } from "./sessions"

const SUB = { startDate: "2026-10-09", endDate: "2026-11-08" }

describe("algiersDay", () => {
  it("renvoie le jour civil UTC+1", () => {
    expect(algiersDay("2026-10-06T12:00:00Z")).toBe("2026-10-06")
  })

  it("rattache 00h30 Alger au bon jour (et non à la veille UTC)", () => {
    // 00h30 le 06/10 à Alger = 23h30 le 05/10 UTC.
    expect(algiersDay("2026-10-05T23:30:00Z")).toBe("2026-10-06")
    // 23h30 le 06/10 à Alger = 22h30 UTC le même jour.
    expect(algiersDay("2026-10-06T22:30:00Z")).toBe("2026-10-06")
  })

  it("bascule correctement au mois suivant", () => {
    expect(algiersDay("2026-10-31T23:30:00Z")).toBe("2026-11-01")
  })
})

describe("countSessionsDone", () => {
  const now = "2026-10-20T10:00:00Z"

  it("compte les jours de présence distincts", () => {
    const done = countSessionsDone(
      ["2026-10-10T08:00:00Z", "2026-10-12T08:00:00Z", "2026-10-15T08:00:00Z"],
      { ...SUB, now },
    )
    expect(done).toBe(3)
  })

  it("ne compte qu'une séance par jour (deux check-ins le même jour)", () => {
    const done = countSessionsDone(
      ["2026-10-10T07:00:00Z", "2026-10-10T18:30:00Z"],
      { ...SUB, now },
    )
    expect(done).toBe(1)
  })

  it("ignore les pointages antérieurs au début de l'abonnement", () => {
    // Régression : l'ancien calcul fenêtrait [end_date - 30j, end_date] et
    // comptait donc des présences d'avant la subscription.
    const done = countSessionsDone(
      ["2026-10-01T08:00:00Z", "2026-10-05T08:00:00Z", "2026-10-11T08:00:00Z"],
      { ...SUB, now },
    )
    expect(done).toBe(1)
  })

  it("ignore les pointages postérieurs à l'instant présent", () => {
    const done = countSessionsDone(
      ["2026-10-11T08:00:00Z", "2026-10-25T08:00:00Z"],
      { ...SUB, now },
    )
    expect(done).toBe(1)
  })

  it("retourne 0 si l'abonnement n'a pas encore commencé", () => {
    const done = countSessionsDone(
      ["2026-10-11T08:00:00Z"],
      { ...SUB, now: "2026-10-05T10:00:00Z" },
    )
    expect(done).toBe(0)
  })

  it(" borne la fenêtre à end_date quand l'abonnement est terminé", () => {
    // Abonnement fini le 08/11 : un pointage du 20/12 ne compte pas.
    const done = countSessionsDone(
      ["2026-11-05T08:00:00Z", "2026-12-20T08:00:00Z"],
      { ...SUB, now: "2026-12-25T10:00:00Z" },
    )
    expect(done).toBe(1)
  })

  it("compte toute la période si l'abonnement est terminé", () => {
    const done = countSessionsDone(
      ["2026-10-10T08:00:00Z", "2026-11-01T08:00:00Z", "2026-11-08T08:00:00Z"],
      { ...SUB, now: "2026-11-20T10:00:00Z" },
    )
    expect(done).toBe(3)
  })

  it("ignore les check_in nuls", () => {
    const done = countSessionsDone([null, null], { ...SUB, now })
    expect(done).toBe(0)
  })

  it("inclut le dernier jour de l'abonnement (end_date = dernier jour valide)", () => {
    // end_date est une DATE SQL : le 08/11 est valide en entier. Comparer à
    // minuit UTC écarterait à tort les présances du 08/11.
    const done = countSessionsDone(["2026-11-08T08:00:00Z"], { ...SUB, now: "2026-11-08T20:00:00Z" })
    expect(done).toBe(1)
  })

  it("exclut le lendemain de end_date", () => {
    const done = countSessionsDone(["2026-11-09T08:00:00Z"], { ...SUB, now: "2026-11-20T10:00:00Z" })
    expect(done).toBe(0)
  })

  it("traite une période plus courte que 30 jours (régression du pack court)", () => {
    // Pack 7 jours : end_date - 30j tombait AVANT start_date, donc l'ancien
    // calcul comptait aussi la présence du 01/10, antérieure à l'abonnement.
    const done = countSessionsDone(
      ["2026-10-01T08:00:00Z", "2026-10-10T08:00:00Z", "2026-10-12T08:00:00Z"],
      { startDate: "2026-10-09", endDate: "2026-10-16", now: "2026-10-13T10:00:00Z" },
    )
    expect(done).toBe(2)
  })

  it("ne dépasse pas le plafond de pointages inspectés", () => {
    const many = Array.from({ length: MAX_CHECKINS + 50 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + i * 3600_000).toISOString(),
    )
    const done = countSessionsDone(many, { ...SUB, now: "2026-12-01T10:00:00Z" })
    expect(done).toBeLessThanOrEqual(MAX_CHECKINS)
    expect(done).toBeGreaterThan(0)
  })

  it("classe un pointage de 23h30 Alger le bon jour (régression UTC)", () => {
    const done = countSessionsDone(["2026-10-10T22:30:00Z"], { ...SUB, now })
    expect(done).toBe(1)
    const done2 = countSessionsDone(["2026-10-09T23:30:00Z"], { ...SUB, now })
    expect(done2).toBe(1)
  })
})