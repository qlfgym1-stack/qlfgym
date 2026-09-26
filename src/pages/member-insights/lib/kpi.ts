import type { MemberRow, PaymentRow, SubscriptionRow, AttendanceRow, PosTransactionRow } from "./raw"
import { buildSubscriptionKeys, isDuplicateSubscriptionPos, isVirtualSubscriptionItem } from "@/lib/ledger-dedupe"

export interface MemberKpi {
  memberId: string
  fullName: string
  status: string
  lastVisit: string | null
  createdAt: string
  currentSub: SubscriptionRow | null
  renewalsCount: number
  totalSubscriptionsCount: number
  totalPaid: number
  paymentsCount: number
  attendanceCount: number
  posTotal: number
  posCount: number
  uniquePosProducts: number
  topPosProducts: Array<{ id: string; name: string; quantity: number; revenue: number }>
  daysSinceLastVisit: number | null
  daysSinceLastPayment: number | null
  avgDaysBetweenSubs: number | null
  subGaps: number[]
  attendanceFrequency: number
  posPerAttendance: number
  lifetimeValue: number
}

function safeNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000)
}

function displayName(m: { first_name: string; last_name: string; full_name: string | null }): string {
  const f = (m.full_name ?? "").trim()
  if (f) return f
  return `${m.first_name} ${m.last_name}`.trim()
}

export function computeMemberKpis(
  members: MemberRow[],
  subscriptions: SubscriptionRow[],
  payments: PaymentRow[],
  attendance: AttendanceRow[],
  pos: PosTransactionRow[]
): MemberKpi[] {
  const now = new Date()

  const subsByMember = new Map<string, SubscriptionRow[]>()
  for (const s of subscriptions) {
    const arr = subsByMember.get(s.member_id) ?? []
    arr.push(s)
    subsByMember.set(s.member_id, arr)
  }
  for (const arr of subsByMember.values()) {
    arr.sort((a, b) => a.start_date.localeCompare(b.start_date))
  }

  const paymentsByMember = new Map<string, PaymentRow[]>()
  for (const p of payments) {
    const arr = paymentsByMember.get(p.member_id) ?? []
    arr.push(p)
    paymentsByMember.set(p.member_id, arr)
  }
  for (const arr of paymentsByMember.values()) {
    arr.sort((a, b) => a.payment_date.localeCompare(b.payment_date))
  }

  const attByMember = new Map<string, number>()
  for (const a of attendance) {
    if (!a.member_id) continue
    attByMember.set(a.member_id, (attByMember.get(a.member_id) ?? 0) + 1)
  }

  const posByMember = new Map<string, { count: number; total: number; products: Map<string, { name: string; quantity: number; revenue: number }> }>()
  const subscriptionKeys = buildSubscriptionKeys(
    payments.filter((p) => p.status === "completed").map((p) => ({ memberId: p.member_id, amount: p.amount, date: p.payment_date }))
  )
  for (const tx of pos) {
    if (isDuplicateSubscriptionPos(
      { memberId: tx.member_id, amount: tx.total, date: tx.created_at, items: tx.items },
      subscriptionKeys
    )) continue
    if (!tx.member_id) continue
    const cur = posByMember.get(tx.member_id) ?? { count: 0, total: 0, products: new Map() }
    cur.count += 1
    cur.total += safeNum(tx.total)
    for (const it of tx.items ?? []) {
      if (!it?.id || isVirtualSubscriptionItem(it)) continue
      const p = cur.products.get(it.id) ?? { name: it.name ?? "", quantity: 0, revenue: 0 }
      p.quantity += safeNum(it.quantity)
      p.revenue += safeNum(it.price) * safeNum(it.quantity)
      cur.products.set(it.id, p)
    }
    posByMember.set(tx.member_id, cur)
  }

  const result: MemberKpi[] = []
  for (const m of members) {
    const subs = subsByMember.get(m.id) ?? []
    const pays = paymentsByMember.get(m.id) ?? []
    const currentSub = subs.length ? subs[subs.length - 1] : null
    const renewalsCount = Math.max(0, subs.length - 1)
    const totalPaid = pays.reduce((acc, p) => acc + safeNum(p.amount), 0)
    const attendanceCount = attByMember.get(m.id) ?? 0
    const posAgg = posByMember.get(m.id) ?? { count: 0, total: 0, products: new Map<string, { name: string; quantity: number; revenue: number }>() }
    const daysSinceLastVisit = m.last_visit ? daysBetween(new Date(m.last_visit), now) : null
    const daysSinceLastPayment = pays.length ? daysBetween(new Date(pays[pays.length - 1].payment_date), now) : null

    const subGaps: number[] = []
    for (let i = 1; i < subs.length; i++) {
      const prevEnd = new Date(subs[i - 1].end_date)
      const nextStart = new Date(subs[i].start_date)
      subGaps.push(Math.max(0, daysBetween(prevEnd, nextStart)))
    }
    const avgDaysBetweenSubs = subGaps.length ? Math.round(subGaps.reduce((s, g) => s + g, 0) / subGaps.length) : null

    const attendanceFrequency = attendanceCount / Math.max(1, subGaps.length + 1)
    const posPerAttendance = attendanceCount > 0 ? posAgg.count / attendanceCount : 0
    const lifetimeValue = totalPaid + posAgg.total

    const top = Array.from(posAgg.products.entries())
      .map(([id, p]) => ({ id, name: p.name, quantity: p.quantity, revenue: p.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3)

    result.push({
      memberId: m.id,
      fullName: displayName(m),
      status: m.status,
      lastVisit: m.last_visit,
      createdAt: m.created_at,
      currentSub,
      renewalsCount,
      totalSubscriptionsCount: subs.length,
      totalPaid,
      paymentsCount: pays.length,
      attendanceCount,
      posTotal: posAgg.total,
      posCount: posAgg.count,
      uniquePosProducts: posAgg.products.size,
      topPosProducts: top,
      daysSinceLastVisit,
      daysSinceLastPayment,
      avgDaysBetweenSubs,
      subGaps,
      attendanceFrequency,
      posPerAttendance,
      lifetimeValue,
    })
  }
  return result
}

export interface AggregateKpis {
  totalMembers: number
  activeMembers: number
  inactiveMembers: number
  suspendedMembers: number
  renewalRate: number
  expiryRate: number
  inactivityRate: number
  avgRevenuePerMember: number
  avgRevenuePerActiveMember: number
  avgAttendanceFrequency: number
  avgPosPerMember: number
  avgBasket: number
  churnRiskRate: number
  ltvAvg: number
}

export function aggregateKpis(kpis: MemberKpi[]): AggregateKpis {
  const total = kpis.length
  if (total === 0) {
    return {
      totalMembers: 0, activeMembers: 0, inactiveMembers: 0, suspendedMembers: 0,
      renewalRate: 0, expiryRate: 0, inactivityRate: 0,
      avgRevenuePerMember: 0, avgRevenuePerActiveMember: 0, avgAttendanceFrequency: 0,
      avgPosPerMember: 0, avgBasket: 0, churnRiskRate: 0, ltvAvg: 0,
    }
  }
  let active = 0, inactive = 0, suspended = 0, renewed = 0, expired = 0, churn = 0
  let totalRev = 0, totalPos = 0, totalAtt = 0, totalBasket = 0, basketCount = 0
  let totalLtv = 0
  for (const k of kpis) {
    if (k.status === "active") active += 1
    else if (k.status === "inactive") inactive += 1
    else if (k.status === "suspended" || k.status === "blocked") suspended += 1
    if (k.renewalsCount > 0) renewed += 1
    if (k.currentSub?.status === "expired") expired += 1
    if (k.daysSinceLastVisit !== null && k.daysSinceLastVisit > 30) churn += 1
    totalRev += k.totalPaid
    totalPos += k.posTotal
    totalAtt += k.attendanceCount
    totalLtv += k.lifetimeValue
    if (k.posCount > 0) {
      totalBasket += k.posTotal
      basketCount += 1
    }
  }
  const activePaying = kpis.filter((k) => k.totalPaid > 0).length || 1
  return {
    totalMembers: total,
    activeMembers: active,
    inactiveMembers: inactive,
    suspendedMembers: suspended,
    renewalRate: (renewed / total) * 100,
    expiryRate: (expired / total) * 100,
    inactivityRate: ((inactive + suspended) / total) * 100,
    avgRevenuePerMember: totalRev / total,
    avgRevenuePerActiveMember: totalRev / activePaying,
    avgAttendanceFrequency: totalAtt / total,
    avgPosPerMember: totalPos / total,
    avgBasket: basketCount > 0 ? totalBasket / basketCount : 0,
    churnRiskRate: (churn / total) * 100,
    ltvAvg: totalLtv / total,
  }
}

export interface SubscriptionTypeStats {
  typeId: string
  name: string
  duration: number
  price: number
  totalSubscriptions: number
  activeCount: number
  expiredCount: number
  totalRevenue: number
  avgRevenuePerSubscription: number
  renewalRate: number
}

export function analyzeSubscriptionTypes(subs: SubscriptionRow[]): SubscriptionTypeStats[] {
  const map = new Map<string, SubscriptionRow[]>()
  for (const s of subs) {
    const arr = map.get(s.subscription_type_id) ?? []
    arr.push(s)
    map.set(s.subscription_type_id, arr)
  }
  const out: SubscriptionTypeStats[] = []
  for (const [typeId, arr] of map.entries()) {
    const sample = arr[0]
    let active = 0, expired = 0, rev = 0
    const membersWithMultiple = new Map<string, number>()
    for (const s of arr) {
      if (s.status === "active") active += 1
      else if (s.status === "expired") expired += 1
      rev += safeNum(s.amount_paid) || safeNum(s.total_amount)
      membersWithMultiple.set(s.member_id, (membersWithMultiple.get(s.member_id) ?? 0) + 1)
    }
    const renewed = Array.from(membersWithMultiple.values()).filter((v) => v > 1).length
    out.push({
      typeId,
      name: sample.type_name,
      duration: sample.type_duration,
      price: sample.type_price,
      totalSubscriptions: arr.length,
      activeCount: active,
      expiredCount: expired,
      totalRevenue: rev,
      avgRevenuePerSubscription: rev / arr.length,
      renewalRate: (renewed / Math.max(1, membersWithMultiple.size)) * 100,
    })
  }
  return out.sort((a, b) => b.totalRevenue - a.totalRevenue)
}

export interface AttendancePeriod {
  totalEntries: number
  entriesByMonth: Array<{ month: string; count: number }>
  entriesByWeek: Array<{ week: string; count: number }>
  avgEntriesPerMember: number
  lastEntry: string | null
  attendanceDays: number
}

export function analyzeAttendance(attendance: AttendanceRow[], memberCount: number): AttendancePeriod {
  const byMonth = new Map<string, number>()
  const byWeek = new Map<string, number>()
  const days = new Set<string>()
  let last: string | null = null
  for (const a of attendance) {
    const day = a.check_in.slice(0, 10)
    days.add(day)
    const month = day.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1)
    const d = new Date(a.check_in)
    const startOfWeek = new Date(d)
    startOfWeek.setDate(d.getDate() - d.getDay())
    const wk = startOfWeek.toISOString().slice(0, 10)
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1)
    if (!last || a.check_in > last) last = a.check_in
  }
  const entriesByMonth = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }))
  const entriesByWeek = Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, count]) => ({ week, count }))
  return {
    totalEntries: attendance.length,
    entriesByMonth,
    entriesByWeek,
    avgEntriesPerMember: memberCount > 0 ? attendance.length / memberCount : 0,
    lastEntry: last,
    attendanceDays: days.size,
  }
}

export interface ActivitySegment {
  veryActive: number
  active: number
  moderate: number
  low: number
  inactive: number
}

export function activitySegment(kpis: MemberKpi[]): ActivitySegment {
  const result: ActivitySegment = { veryActive: 0, active: 0, moderate: 0, low: 0, inactive: 0 }
  for (const k of kpis) {
    const att = k.attendanceCount
    if (att >= 20) result.veryActive += 1
    else if (att >= 10) result.active += 1
    else if (att >= 4) result.moderate += 1
    else if (att >= 1) result.low += 1
    else result.inactive += 1
  }
  return result
}
