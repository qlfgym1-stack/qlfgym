import { describe, it, expect } from "vitest"
import {
  paymentDedupeKey,
  buildSubscriptionIndex,
  isVirtualSubscriptionItem,
  hasVirtualSubscriptionItems,
  extractVirtualSubscriptionRefs,
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

describe("buildSubscriptionIndex", () => {
  it("ignore les clés minute des paiements sans membre", () => {
    const index = buildSubscriptionIndex([
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" },
      { memberId: null, amount: 4000, date: "2026-09-01T10:15:00+00:00" },
    ])
    expect(index.byMinuteKey.size).toBe(1)
  })

  it("dédoublonne les clés minute identiques", () => {
    const index = buildSubscriptionIndex([
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" },
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:30+00:00" },
    ])
    expect(index.byMinuteKey.size).toBe(1)
  })

  it("indexe les subscription_id sans dédoublonner les minutes", () => {
    const index = buildSubscriptionIndex([
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00", subscriptionId: "sub-a" },
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:30+00:00", subscriptionId: "sub-a" },
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:20:00+00:00", subscriptionId: "sub-b" },
    ])
    expect([...index.bySubscriptionId].sort()).toEqual(["sub-a", "sub-b"])
    expect(index.byMinuteKey.size).toBe(2)
  })

  it("accepte un subscriptionId absent", () => {
    const index = buildSubscriptionIndex([{ memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" }])
    expect(index.bySubscriptionId.size).toBe(0)
    expect(index.byMinuteKey.size).toBe(1)
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

describe("extractVirtualSubscriptionRefs", () => {
  it("extrait le subscription_id d'un item __subscription__", () => {
    const refs = extractVirtualSubscriptionRefs([
      { id: "__subscription__1463e049-1111-2222-3333-444455556666" },
      { id: "prod-1" },
    ])
    expect(refs.subscriptionIds).toEqual(["1463e049-1111-2222-3333-444455556666"])
    expect(refs.hasRenewal).toBe(false)
  })

  it("signale un __renewal__ sans en extraire d'id (ancien subscription_id)", () => {
    const refs = extractVirtualSubscriptionRefs([{ id: "__renewal__1463e049-1111-2222-3333-444455556666" }])
    expect(refs.subscriptionIds).toEqual([])
    expect(refs.hasRenewal).toBe(true)
  })

  it("ignore les préfixes vides et les valeurs invalides", () => {
    const refs = extractVirtualSubscriptionRefs([{ id: "__subscription__" }, { id: 42 }, null, "x"])
    expect(refs.subscriptionIds).toEqual([])
    expect(refs.hasRenewal).toBe(false)
  })

  it("renvoie des refs vides pour une entrée non-tableau", () => {
    expect(extractVirtualSubscriptionRefs("pas-un-tableau")).toEqual({ subscriptionIds: [], hasRenewal: false })
  })
})

describe("isDuplicateSubscriptionPos — appariement exact par subscription_id", () => {
  it("détecte un doublon même quand le paiement est passé à la minute suivante", () => {
    const index = buildSubscriptionIndex([
      { memberId: "m1", amount: 1200, date: "2026-09-21T17:42:53+00:00", subscriptionId: "sub-dup" },
    ])
    expect(
      isDuplicateSubscriptionPos(
        {
          memberId: "m1",
          amount: 1200,
          date: "2026-09-21T17:43:04+00:00",
          items: [{ id: "__subscription__sub-dup" }],
        },
        index
      )
    ).toBe(true)
  })

  it("ne dédoublonne pas un abonnement payé avec un subscription_id différent", () => {
    const index = buildSubscriptionIndex([
      { memberId: "m1", amount: 4000, date: "2026-09-21T17:42:53+00:00", subscriptionId: "sub-paye" },
    ])
    expect(
      isDuplicateSubscriptionPos(
        {
          memberId: "m1",
          amount: 4000,
          date: "2026-09-21T17:42:53+00:00",
          items: [{ id: "__subscription__sub-autre" }],
        },
        index
      )
    ).toBe(false)
  })

  it("replie sur la clé minute quand le paiement n'expose pas de subscription_id", () => {
    const index = buildSubscriptionIndex([{ memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" }])
    expect(
      isDuplicateSubscriptionPos(
        {
          memberId: "m1",
          amount: 4000,
          date: "2026-09-01T10:15:20+00:00",
          items: [{ id: "__subscription__sub-connu" }],
        },
        index
      )
    ).toBe(true)
  })

  it("utilise le repli minute pour un panier mixte abonnement + renouvellement", () => {
    const index = buildSubscriptionIndex([{ memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" }])
    expect(
      isDuplicateSubscriptionPos(
        {
          memberId: "m1",
          amount: 4000,
          date: "2026-09-01T10:15:20+00:00",
          items: [{ id: "__subscription__sub-x" }, { id: "__renewal__ancien" }],
        },
        index
      )
    ).toBe(true)
  })
})

describe("isDuplicateSubscriptionPos — régressions ventes légitimes (prod)", () => {
  // Ces 3 ventes ont le même membre et le même montant qu'un paiement, mais un
  // subscription_id DIFFÉRENT : ce sont des achats distincts, pas des doublons.
  // Une fenêtre de tolérance temporelle les aurait supprimées (≈4 000 DA perdus).
  const cases: Array<{ label: string; subPos: string; subPay: string; gap: number; amount: number }> = [
    { label: "29 s", subPos: "19f82bfc", subPay: "b7bcab32", gap: 29, amount: 2000 },
    { label: "61 s", subPos: "e6de897e", subPay: "c32e5a4a", gap: 61, amount: 2000 },
    { label: "187 s", subPos: "1463e049", subPay: "33ea59f1", gap: 187, amount: 2000 },
  ]

  for (const c of cases) {
    it(`conserve la vente légitime séparée de ${c.gap} s (abonnements différents)`, () => {
      const payDate = new Date("2026-09-10T17:10:00+00:00")
      const posDate = new Date(payDate.getTime() + c.gap * 1000)
      const index = buildSubscriptionIndex([
        {
          memberId: "m-doublon-apparent",
          amount: c.amount,
          date: payDate.toISOString(),
          subscriptionId: c.subPay,
        },
      ])
      expect(
        isDuplicateSubscriptionPos(
          {
            memberId: "m-doublon-apparent",
            amount: c.amount,
            date: posDate.toISOString(),
            items: [{ id: `__subscription__${c.subPos}` }],
          },
          index
        )
      ).toBe(false)
    })
  }

  it("conserve la vente même si les deux tombent dans la même minute (abonnements différents)", () => {
    const index = buildSubscriptionIndex([
      { memberId: "m1", amount: 2000, date: "2026-09-10T17:10:20+00:00", subscriptionId: "sub-b" },
    ])
    expect(
      isDuplicateSubscriptionPos(
        {
          memberId: "m1",
          amount: 2000,
          date: "2026-09-10T17:10:29+00:00",
          items: [{ id: "__subscription__sub-a" }],
        },
        index
      )
    ).toBe(false)
  })
})

describe("isDuplicateSubscriptionPos — cas généraux", () => {
  const index = buildSubscriptionIndex([
    { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00", subscriptionId: "sub-a" },
  ])

  it("détecte une vente POS abonnement doublonnant un paiement", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__subscription__sub-a" }] },
        index
      )
    ).toBe(true)
  })

  it("détecte un renouvellement POS doublonnant un paiement (repli minute)", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__renewal__ancien" }] },
        index
      )
    ).toBe(true)
  })

  it("garde une vente POS produit (non virtuelle) même si taux identique", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "prod-1" }] },
        index
      )
    ).toBe(false)
  })

  it("garde un abonnement POS dont le subscription_id n'a pas été payé", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-02T10:15:00+00:00", items: [{ id: "__subscription__sub-jamais-paye" }] },
        index
      )
    ).toBe(false)
  })

  it("déduplique un abonnement déjà payé même si la vente est datée plus tard", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-02T10:15:00+00:00", items: [{ id: "__subscription__sub-a" }] },
        index
      )
    ).toBe(true)
  })

  it("déduplique par abonnement même sans membre rattaché (l'id est la preuve)", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: null, amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__subscription__sub-a" }] },
        index
      )
    ).toBe(true)
  })

  it("n'applique jamais la clé minute si le membre est absent", () => {
    const noMemberIndex = buildSubscriptionIndex([
      { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:00+00:00" },
    ])
    expect(
      isDuplicateSubscriptionPos(
        { memberId: null, amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__renewal__ancien" }] },
        noMemberIndex
      )
    ).toBe(false)
  })

  it("ne dédoublonne pas une séance libre (__dropin__)", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "2026-09-01T10:15:20+00:00", items: [{ id: "__dropin__x" }] },
        index
      )
    ).toBe(false)
  })

  it("gère une date invalide sans lever (repli minute)", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "pas-une-date", items: [{ id: "__renewal__ancien" }] },
        index
      )
    ).toBe(false)
  })

  it("déduplique par abonnement malgré une date invalide", () => {
    expect(
      isDuplicateSubscriptionPos(
        { memberId: "m1", amount: 4000, date: "pas-une-date", items: [{ id: "__subscription__sub-a" }] },
        index
      )
    ).toBe(true)
  })
})
