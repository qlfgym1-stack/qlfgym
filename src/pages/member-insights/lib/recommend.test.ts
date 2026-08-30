import { describe, it, expect } from "vitest"
import { generateRecommendations, recommendationGroups, type MemberRecommendation } from "./recommend"
import type { MemberKpi } from "./kpi"
import type { SubscriptionRow } from "./raw"

const DAY = 86400000
const NOW = new Date()

function sub(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "s1",
    member_id: "m1",
    subscription_type_id: "t1",
    start_date: "2026-07-01",
    end_date: "2026-09-01",
    total_amount: 2500,
    amount_paid: 2500,
    status: "active",
    type_name: "Mensuel",
    type_duration: 30,
    type_price: 2500,
    ...over,
  }
}

function kpi(memberId: string, over: Partial<MemberKpi> = {}): MemberKpi {
  return {
    memberId,
    fullName: `Membre ${memberId}`,
    status: "active",
    lastVisit: new Date(NOW.getTime() - 2 * DAY).toISOString(),
    createdAt: new Date(NOW.getTime() - 90 * DAY).toISOString(),
    currentSub: null,
    renewalsCount: 0,
    totalSubscriptionsCount: 1,
    totalPaid: 0,
    paymentsCount: 0,
    attendanceCount: 0,
    posTotal: 0,
    posCount: 0,
    uniquePosProducts: 0,
    topPosProducts: [],
    daysSinceLastVisit: 2,
    daysSinceLastPayment: null,
    avgDaysBetweenSubs: null,
    subGaps: [],
    attendanceFrequency: 0,
    posPerAttendance: 0,
    lifetimeValue: 0,
    ...over,
  }
}

describe("generateRecommendations", () => {
  it("flags subscriptions expiring soon as priority 0", () => {
    const soon = new Date(NOW.getTime() + 3 * DAY).toISOString().slice(0, 10)
    const recs = generateRecommendations([kpi("m1", { currentSub: sub({ end_date: soon, status: "active" }) })])
    expect(recs.some((r) => r.type === "renew-soon" && r.priority === 0)).toBe(true)
    expect(recs.find((r) => r.type === "renew-soon")?.days).toBeGreaterThanOrEqual(0)
    expect(recs.find((r) => r.type === "renew-soon")?.days).toBeLessThanOrEqual(3)
  })

  it("flags expired subscriptions", () => {
    const recs = generateRecommendations([
      kpi("m1", { currentSub: sub({ status: "expired" }), daysSinceLastPayment: 15 }),
    ])
    expect(recs.some((r) => r.type === "expired" && r.days === 15)).toBe(true)
  })

  it("flags long-inactive members and reactivatable high value", () => {
    const recs = generateRecommendations([
      kpi("m1", { status: "inactive", daysSinceLastVisit: 40, lifetimeValue: 50000 }),
    ])
    expect(recs.some((r) => r.type === "at-risk" && r.days === 40)).toBe(true)
    expect(recs.some((r) => r.type === "reactivate-high-value")).toBe(true)
  })

  it("does not recommend renew for a far-future subscription", () => {
    const far = new Date(NOW.getTime() + 60 * DAY).toISOString().slice(0, 10)
    const recs = generateRecommendations([kpi("m1", { currentSub: sub({ end_date: far, status: "active" }) })])
    expect(recs.some((r) => r.type === "renew-soon")).toBe(false)
  })

  it("recommends upsell for high POS spenders on short subscriptions", () => {
    const recs = generateRecommendations([kpi("m1", { posTotal: 15000, currentSub: sub({}) })])
    expect(recs.some((r) => r.type === "upsell" && r.priority === 2)).toBe(true)
  })

  it("groups by priority", () => {
    const recs: MemberRecommendation[] = [
      { memberId: "a", fullName: "A", type: "renew-soon", priority: 0, days: 2 },
      { memberId: "b", fullName: "B", type: "at-risk", priority: 1, days: 30 },
      { memberId: "c", fullName: "C", type: "upsell", priority: 2, days: null },
    ]
    const groups = recommendationGroups(recs)
    expect(groups[0]).toHaveLength(1)
    expect(groups[1]).toHaveLength(1)
    expect(groups[2]).toHaveLength(1)
  })
})
