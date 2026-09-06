import { describe, it, expect } from "vitest"
import {
  paymentDedupeKey,
  buildSubscriptionKeys,
  isVirtualSubscriptionItem,
  hasVirtualSubscriptionItems,
  isDuplicateSubscriptionPos,
} from "./ledger-dedupe"

describe("paymentDedupeKey", () => {
  it("renvoie null si memberId manquant", () => {
    expect(paymentDedupeKey(null, 4000, "2026-09-01T10:00:00+00:00")).toBeNull()
    expect(paymentDedupeKey("", 4000, "2026-09-01T10:00:00+00:00")).toBeNull()
  })

  it("renvoie null si date invalide", () => {
    expect(paymentDedupeKey("m1", 4000, "pas-une-date")).toBeNull()
  })

  it("formate membre|centimes|minute", () => {
    const key = paymentDedupeKey("m1", 4000, "2026-09-01T10:15:30+00:00")
    expect(key).toBe(`m1|${Math.round(4000 * 100)}|${Math.floor(new Date("2026-09-01T10:15:30+00:00").getTime() / 60000)}`)
  })

  it("ignore les fractions de centime et arrondit la minute", () => {
    const a = paymentDedupeKey("m1", 4000.005, "2026-09-01T10:15:00.000+00:00")
    const b = paymentDedupeKey("m1", 4000, "2026-09-01T10:15:45.000+00:00")
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.split("|")[1]).toBe(String(Math.round(4000.005 * 100)))
    expect(b!.split("|")[2]).toBe(a!.split("|")[2])
  })
})

describe("buildSubscriptionKeys", () => {
  it("ignore les paiements sans membre", () => {
    const keys = buildSubscriptionKeys([
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" },
      { memberId: null, amount: 4000, date: "2026-09-01T10:15:00+00:00" },
    ])
    expect(keys.size).toBe(1)
  })

  it("dédoublonne les clés identiques", () => {
    const keys = buildSubscriptionKeys([
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" },
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:30+00:00" },
    ])
    expect(keys.size).toBe(1)
  })
})

describe("isVirtualSubscriptionItem", () => {
  it("reconnaît un item abonnement", () => {
    expect(isVirtualSubscriptionItem({ id: "__subscription__abc", name: "Abonnement", price: 4000 })).toBe(true)
  })
  it("reconnaît un item renouvellement", () => {
    expect(isVirtualSubscriptionItem({ id: "__renewal__abc", price: 4000 })).toBe(true)
  })
  it("refuse un produit physique", () => {
    expect(isVirtualSubscriptionItem({ id: "prod-1", name: "Protéine" })).toBe(false)
  })
  it("refuse les valeurs non-objets", () => {
    expect(isVirtualSubscriptionItem(null)).toBe(false)
    expect(isVirtualSubscriptionItem("x")).toBe(false)
    expect(isVirtualSubscriptionItem({ id: 42 })).toBe(false)
  })
})

describe("hasVirtualSubscriptionItems", () => {
  it("détecte un abonnement ou renouvellement dans les items", () => {
    expect(hasVirtualSubscriptionItems([{ id: "__subscription__x" }])).toBe(true)
    expect(hasVirtualSubscriptionItems([{ id: "__renewal__x" }])).toBe(true)
    expect(hasVirtualSubscriptionItems([{ id: "prod-1" }, { id: "prod-2" }])).toBe(false)
    expect(hasVirtualSubscriptionItems("pas-un-tableau")).toBe(false)
    expect(hasVirtualSubscriptionItems([])).toBe(false)
  })
})

describe("isDuplicateSubscriptionPos", () => {
  const payments = [{ memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" }]
  const keys = buildSubscriptionKeys(payments)

  it("détecte une vente POS abonnement doublonnant un paiement", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__subscription__abc" }] },
        keys
      )
    ).toBe(true)
  })

  it("détecte un renouvellement POS doublonnant un paiement", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__renewal__abc" }] },
        keys
      )
    ).toBe(true)
  })

  it("garde une vente POS produit (non virtuelle) même si taux identique", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "prod-1" }] },
        keys
      )
    ).toBe(false)
  })

  it("garde un abonnement POS sans paiement correspondant", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-02T10:15:00+00:00", items: [{ id: "__subscription__abc" }] },
        keys
      )
    ).toBe(false)
  })

  it("garde un abonnement POS sans membre", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: null, amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__subscription__abc" }] },
        keys
      )
    ).toBe(false)
  })
})