import { describe, it, expect } from "vitest"
import { analyzeFinance } from "./finance"
import type { PaymentRow, PosTransactionRow } from "./raw"

function payment(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "p1",
    member_id: "m1",
    subscription_id: null,
    amount: 1000,
    payment_method: "cash",
    payment_date: "2026-08-01T10:00:00Z",
    status: "completed",
    ...over,
  }
}

function pos(over: Partial<PosTransactionRow> = {}): PosTransactionRow {
  return {
    id: "tx1",
    member_id: "m1",
    total: 3000,
    created_at: "2026-08-02T10:00:00Z",
    items: [
      { id: "a", name: "Whey", price: 2000, quantity: 1 },
      { id: "b", name: "Shaker", price: 1000, quantity: 1 },
    ],
    ...over,
  }
}

describe("analyzeFinance", () => {
  it("aggregates pos products by revenue and keeps the top ones", () => {
    const stats = analyzeFinance(
      [],
      [
        pos({ total: 5000, items: [
          { id: "a", name: "Whey", price: 2000, quantity: 2 },
          { id: "c", name: "Gants", price: 1000, quantity: 1 },
        ] }),
        pos({ total: 2000, items: [
          { id: "a", name: "Whey", price: 2000, quantity: 1 },
        ] }),
      ]
    )
    expect(stats.topProducts).toHaveLength(2)
    expect(stats.topProducts[0]).toEqual({ id: "a", name: "Whey", quantity: 3, revenue: 6000 })
    expect(stats.topProducts[1]).toEqual({ id: "c", name: "Gants", quantity: 1, revenue: 1000 })
    expect(stats.totalPosRevenue).toBe(7000)
  })

  it("groups completed payments by method with percentages", () => {
    const stats = analyzeFinance(
      [
        payment({ amount: 4000, payment_method: "cash" }),
        payment({ amount: 6000, payment_method: "card" }),
        payment({ amount: 2000, payment_method: "card" }),
        payment({ amount: 9999, status: "cancelled" }),
      ],
      []
    )
    expect(stats.totalSubscriptionRevenue).toBe(12000)
    expect(stats.totalRevenue).toBe(12000)
    expect(stats.paymentMethods).toHaveLength(2)
    const card = stats.paymentMethods.find((m) => m.method === "card")
    expect(card?.total).toBe(8000)
    expect(card?.count).toBe(2)
    expect(card?.pct).toBeCloseTo(66.67, 2)
    const cash = stats.paymentMethods.find((m) => m.method === "cash")
    expect(cash?.pct).toBeCloseTo(33.33, 2)
  })

  it("falls back to other for empty payment method", () => {
    const stats = analyzeFinance([payment({ payment_method: "" })], [])
    expect(stats.paymentMethods[0]?.method).toBe("other")
  })

  it("excludes subscription POS transactions already counted as payments", () => {
    const stats = analyzeFinance(
      [payment({ id: "p1", member_id: "m1", amount: 1000, payment_date: "2026-08-02T10:00:00Z" })],
      [
        pos({ id: "tx1", member_id: "m1", total: 1000, created_at: "2026-08-02T10:00:00Z", items: [
          { id: "__subscription__basic", name: "Abonnement", price: 1000, quantity: 1 },
        ] }),
        pos({ id: "tx2", member_id: "m1", total: 2500, created_at: "2026-08-03T10:00:00Z", items: [
          { id: "a", name: "Whey", price: 2500, quantity: 1 },
        ] }),
      ]
    )
    expect(stats.totalPosRevenue).toBe(2500)
    expect(stats.totalRevenue).toBe(3500)
    expect(stats.topProducts).toHaveLength(1)
    expect(stats.topProducts[0]?.id).toBe("a")
  })

  it("keeps standalone subscription POS without matching payment but excludes its virtual item", () => {
    const stats = analyzeFinance(
      [],
      [
        pos({ id: "tx1", member_id: "m1", total: 1000, created_at: "2026-08-02T10:00:00Z", items: [
          { id: "__renewal__basic", name: "Renouvellement", price: 1000, quantity: 1 },
        ] }),
      ]
    )
    expect(stats.totalPosRevenue).toBe(1000)
    expect(stats.topProducts).toHaveLength(0)
  })

  it("dedupes renewal POS matching a completed payment but not a cancelled one", () => {
    const stats = analyzeFinance(
      [payment({ id: "p1", member_id: "m1", amount: 1000, payment_date: "2026-08-02T10:00:00Z" })],
      [
        pos({ id: "tx1", member_id: "m1", total: 1000, created_at: "2026-08-02T10:00:00Z", items: [
          { id: "__renewal__basic", name: "Renouvellement", price: 1000, quantity: 1 },
        ] }),
      ]
    )
    expect(stats.totalPosRevenue).toBe(0)
    expect(stats.totalRevenue).toBe(1000)
  })

  it("keeps renewal POS when its only matching payment is cancelled", () => {
    const stats = analyzeFinance(
      [payment({ id: "p1", member_id: "m1", amount: 1000, payment_date: "2026-08-02T10:00:00Z", status: "cancelled" })],
      [
        pos({ id: "tx1", member_id: "m1", total: 1000, created_at: "2026-08-02T10:00:00Z", items: [
          { id: "__renewal__basic", name: "Renouvellement", price: 1000, quantity: 1 },
        ] }),
      ]
    )
    expect(stats.totalPosRevenue).toBe(1000)
    expect(stats.totalRevenue).toBe(1000)
  })
})
